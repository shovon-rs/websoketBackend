import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { connectionManager } from '../../websocket/connection.manager';

export type LiveParticipantRole = 'broadcaster' | 'viewer';

const LIVE_ROOM_PREFIX = 'live:';
export const liveRoom = (announcementId: string): string => `${LIVE_ROOM_PREFIX}${announcementId}`;

async function loadLiveAnnouncement(announcementId: string) {
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: { invites: true, liveSession: true },
  });
  if (!announcement) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return announcement;
}

/**
 * Validates that a user may participate in this live session and resolves their role.
 * Does NOT touch the room roster — see assertRoomMember below for why the authoritative
 * live roster is the in-memory room, not the database.
 */
export async function assertLiveParticipant(announcementId: string, userId: string) {
  const announcement = await loadLiveAnnouncement(announcementId);
  if (announcement.status !== 'live' || !announcement.liveSession) {
    throw Object.assign(new Error('LIVESTREAM_NOT_ACTIVE'), { status: 409 });
  }

  const isBroadcaster = announcement.broadcasterId === userId;
  if (!isBroadcaster) {
    const eligible =
      announcement.audience === 'everyone' || announcement.invites.some((invite) => invite.userId === userId);
    if (!eligible) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }

  const role: LiveParticipantRole = isBroadcaster ? 'broadcaster' : 'viewer';
  return { announcement, session: announcement.liveSession, role };
}

/**
 * The authoritative live roster for signaling/authorization purposes is the in-memory room
 * (self-cleaning on disconnect via connectionManager.remove) — NOT LiveStreamViewer.leftAt,
 * which is only set on an explicit live:leave and exists purely for audit/analytics.
 */
export function currentViewerIds(announcementId: string, broadcasterId: string): string[] {
  const members = connectionManager.getRoom(liveRoom(announcementId));
  const ids = new Set(members.map((m) => m.userId));
  ids.delete(broadcasterId);
  return [...ids];
}

export function isRoomMember(announcementId: string, userId: string): boolean {
  return connectionManager.getRoom(liveRoom(announcementId)).some((m) => m.userId === userId);
}

export function assertViewerCapacity(announcementId: string, broadcasterId: string): void {
  if (currentViewerIds(announcementId, broadcasterId).length >= env.LIVESTREAM_MAX_VIEWERS) {
    throw Object.assign(new Error('LIVESTREAM_FULL'), { status: 409 });
  }
}

export async function recordViewerJoin(sessionId: string, userId: string): Promise<void> {
  await prisma.liveStreamViewer.create({ data: { sessionId, userId } });
}

export async function recordViewerLeft(sessionId: string, userId: string): Promise<void> {
  const openRecord = await prisma.liveStreamViewer.findFirst({
    where: { sessionId, userId, leftAt: null },
    orderBy: { joinedAt: 'desc' },
  });
  if (openRecord) await prisma.liveStreamViewer.update({ where: { id: openRecord.id }, data: { leftAt: new Date() } });
}

export async function endSession(announcementId: string): Promise<void> {
  await prisma.$transaction([
    prisma.liveStreamSession.updateMany({ where: { announcementId, endedAt: null }, data: { endedAt: new Date() } }),
    prisma.announcement.update({ where: { id: announcementId }, data: { status: 'ended', endedAt: new Date() } }),
  ]);
}
