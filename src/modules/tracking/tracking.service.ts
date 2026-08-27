import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

// Round to ~1-10m precision — data minimization per privacy policy (§16/§17).
function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const USER_SELECT = { id: true, displayName: true, email: true } as const;

export async function startSession(userId: string) {
  return prisma.trackingSession.create({
    data: { userId, consentAt: new Date() },
  });
}

export async function endSession(sessionId: string, userId: string) {
  return prisma.trackingSession.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

export async function assertOwner(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.trackingSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw new Error('FORBIDDEN');
}

/** Owner or an explicitly authorized viewer may join/view a session's live feed. */
export async function assertCanView(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.trackingSession.findUnique({
    where: { id: sessionId },
    include: { viewers: { where: { userId } } },
  });
  if (!session) throw new Error('FORBIDDEN');
  if (session.userId === userId) return;
  if (session.viewers.length === 0) throw new Error('FORBIDDEN');
}

export async function addViewer(sessionId: string, ownerId: string, viewerUserId: string) {
  await assertOwner(sessionId, ownerId);
  if (viewerUserId === ownerId) throw new Error('CANNOT_SHARE_WITH_SELF');

  await prisma.trackingSessionViewer.upsert({
    where: { sessionId_userId: { sessionId, userId: viewerUserId } },
    update: {},
    create: { sessionId, userId: viewerUserId },
  });

  return prisma.user.findUniqueOrThrow({ where: { id: viewerUserId }, select: USER_SELECT });
}

export async function removeViewer(sessionId: string, ownerId: string, viewerUserId: string) {
  await assertOwner(sessionId, ownerId);
  return prisma.trackingSessionViewer.deleteMany({ where: { sessionId, userId: viewerUserId } });
}

export async function recordLocation(sessionId: string, lat: number, lng: number) {
  return prisma.trackingLocation.create({
    data: { sessionId, lat: roundCoordinate(lat), lng: roundCoordinate(lng) },
  });
}

export async function getSession(sessionId: string) {
  return prisma.trackingSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: USER_SELECT },
      locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
  });
}

/** Sessions the user owns and is currently sharing (endedAt is null). */
export async function listOwnedActiveSessions(userId: string) {
  return prisma.trackingSession.findMany({
    where: { userId, endedAt: null },
    include: {
      viewers: { include: { user: { select: USER_SELECT } } },
      locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
    orderBy: { startedAt: 'desc' },
  });
}

/** Active sessions someone else has shared with this user. */
export async function listSharedActiveSessions(userId: string) {
  return prisma.trackingSession.findMany({
    where: { endedAt: null, viewers: { some: { userId } } },
    include: {
      user: { select: USER_SELECT },
      locations: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
    orderBy: { startedAt: 'desc' },
  });
}

export async function purgeSessionLocations(sessionId: string, requestedBy: string) {
  logger.info({ sessionId, userId: requestedBy, purpose: 'user-requested-deletion' }, 'Purging tracking locations');
  return prisma.trackingLocation.deleteMany({ where: { sessionId } });
}

export async function purgeOldLocationData(): Promise<number> {
  const cutoff = new Date(Date.now() - env.LOCATION_RETENTION_DAYS * 86_400_000);
  const result = await prisma.trackingLocation.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  logger.info({ cutoff, deleted: result.count }, 'Location retention sweep complete');
  return result.count;
}
