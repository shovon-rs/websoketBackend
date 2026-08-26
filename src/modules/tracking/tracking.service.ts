import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

// Round to ~1-10m precision — data minimization per privacy policy (§16/§17).
function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

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

export async function recordLocation(sessionId: string, lat: number, lng: number) {
  return prisma.trackingLocation.create({
    data: { sessionId, lat: roundCoordinate(lat), lng: roundCoordinate(lng) },
  });
}

export async function getSession(sessionId: string) {
  return prisma.trackingSession.findUnique({
    where: { id: sessionId },
    include: { locations: { orderBy: { recordedAt: 'desc' }, take: 100 } },
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
