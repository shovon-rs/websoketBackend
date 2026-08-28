import { Announcement } from '@prisma/client';
import { prisma } from '../../config/database';
import { connectionManager } from '../../websocket/connection.manager';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import { getManyOnlineSince } from '../../redis/presence';
import { enqueuePushBulk } from '../../queue/push.queue';
import { hasRole } from '../../utils/roles';
import { ANNOUNCEMENTS_ROOM } from './announcements.handler';
import { CreateAnnouncementInput } from './announcements.schemas';

const announcementInclude = {
  invites: { include: { user: { select: { id: true, displayName: true, email: true } } } },
} as const;

type AnnouncementWithInvites = Announcement & {
  invites: { userId: string; user: { id: string; displayName: string; email: string } }[];
};

function serialize(announcement: AnnouncementWithInvites) {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    authorId: announcement.authorId,
    broadcasterId: announcement.broadcasterId,
    audience: announcement.audience,
    invitedUsers: announcement.audience === 'invited' ? announcement.invites.map((i) => i.user) : undefined,
    scheduledAt: announcement.scheduledAt,
    status: announcement.status,
    createdAt: announcement.createdAt,
  };
}

function visibilityWhere(userId: string, role: string) {
  if (hasRole(role, 'admin')) return {};
  return {
    OR: [
      { audience: 'everyone' },
      { authorId: userId },
      { broadcasterId: userId },
      { invites: { some: { userId } } },
    ],
  };
}

export async function createAnnouncement(authorId: string, input: CreateAnnouncementInput) {
  const announcement = await prisma.announcement.create({
    data: {
      authorId,
      kind: 'general',
      title: input.title,
      body: input.body,
      audience: input.audience,
      status: 'published',
      invites:
        input.audience === 'invited' && input.inviteUserIds
          ? { create: input.inviteUserIds.map((userId) => ({ userId })) }
          : undefined,
    },
    include: announcementInclude,
  });

  await deliverAnnouncement(announcement, 'created');
  return serialize(announcement);
}

export async function listVisibleAnnouncements(userId: string, role: string) {
  const announcements = await prisma.announcement.findMany({
    where: visibilityWhere(userId, role),
    include: announcementInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return announcements.map(serialize);
}

export async function getUpcomingAnnouncement(userId: string, role: string) {
  const announcement = await prisma.announcement.findFirst({
    where: {
      ...visibilityWhere(userId, role),
      status: { in: ['scheduled', 'live'] },
      scheduledAt: { not: null },
    },
    include: announcementInclude,
    orderBy: { scheduledAt: 'asc' },
  });
  return announcement ? serialize(announcement) : null;
}

export async function getAnnouncement(id: string, userId: string, role: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id }, include: announcementInclude });
  if (!announcement) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const visible =
    hasRole(role, 'admin') ||
    announcement.audience === 'everyone' ||
    announcement.authorId === userId ||
    announcement.broadcasterId === userId ||
    announcement.invites.some((i) => i.userId === userId);
  if (!visible) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });

  return serialize(announcement);
}

export async function cancelAnnouncement(id: string) {
  const announcement = await prisma.announcement.update({
    where: { id },
    data: { status: 'cancelled', endedAt: new Date() },
    include: announcementInclude,
  });
  return serialize(announcement);
}

/**
 * Race-safe countdown sweep: multiple server instances may run this loop unsynchronized
 * (no leader election exists anywhere in this app). The conditional updateMany below only
 * affects a row if it is STILL 'scheduled' at the moment Postgres applies it, making it a
 * real compare-and-swap — exactly one instance's claim succeeds per row, so exactly one
 * "starting now" notification goes out. Do not simplify this into a blind batch update.
 */
export async function processDueAnnouncements(): Promise<void> {
  const due = await prisma.announcement.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    select: { id: true },
  });

  for (const row of due) {
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.announcement.updateMany({
        where: { id: row.id, status: 'scheduled' },
        data: { status: 'live', startedAt: new Date() },
      });
      if (result.count !== 1) return null;

      const announcement = await tx.announcement.findUniqueOrThrow({
        where: { id: row.id },
        include: announcementInclude,
      });

      if (announcement.kind === 'livestream' && announcement.broadcasterId) {
        await tx.liveStreamSession.create({
          data: { announcementId: announcement.id, broadcasterId: announcement.broadcasterId },
        });
      }

      return announcement;
    });

    if (claimed) await deliverAnnouncement(claimed, 'live');
  }
}

export async function deliverAnnouncement(announcement: AnnouncementWithInvites, phase: 'created' | 'live'): Promise<void> {
  const wsType = phase === 'created' ? 'announcement:new' : 'announcement:live';
  const payload = serialize(announcement);

  if (announcement.audience === 'everyone') {
    await deliverToEveryone(announcement.id, wsType, payload, announcement.title, announcement.body);
  } else {
    const userIds = announcement.invites.map((i) => i.userId);
    await deliverToUsers(userIds, announcement.id, wsType, payload, announcement.title, announcement.body);
  }
}

async function deliverToEveryone(
  announcementId: string,
  wsType: string,
  wsPayload: unknown,
  title: string,
  body: string,
): Promise<void> {
  // 1. Live, cross-instance fan-out to everyone currently connected — one Redis publish,
  //    every instance's local room subscriber relays to its own local sockets.
  roomManager.broadcastToRoom(ANNOUNCEMENTS_ROOM, buildEvent(wsType, wsPayload));

  // 2. Persist for every user in one round trip — this is what makes the announcement
  //    recoverable via GET /notifications if a user missed the WS beat.
  const users = await prisma.user.findMany({ select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: 'info',
      title,
      body,
      data: { kind: 'announcement', announcementId },
    })),
  });

  // 3. Offline push, determined via cross-instance Redis presence (not connectionManager,
  //    which is per-instance-local and would misreport users on another instance as offline).
  const onlineSince = await getManyOnlineSince(userIds);
  const offlineUserIds = userIds.filter((id) => !onlineSince.get(id));
  if (offlineUserIds.length > 0) {
    await enqueuePushBulk(
      offlineUserIds.map((userId) => ({ userId, payload: { title, body, data: { kind: 'announcement', announcementId } } })),
    );
  }
}

async function deliverToUsers(
  userIds: string[],
  announcementId: string,
  wsType: string,
  wsPayload: unknown,
  title: string,
  body: string,
): Promise<void> {
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: 'info',
      title,
      body,
      data: { kind: 'announcement', announcementId },
    })),
  });

  const message = JSON.stringify(buildEvent(wsType, wsPayload));
  const offlineUserIds: string[] = [];

  for (const userId of userIds) {
    const sockets = connectionManager.getByUser(userId);
    if (sockets.length > 0) {
      for (const conn of sockets) conn.socket.send(message);
    } else {
      offlineUserIds.push(userId);
    }
  }

  if (offlineUserIds.length > 0) {
    await enqueuePushBulk(
      offlineUserIds.map((userId) => ({ userId, payload: { title, body, data: { kind: 'announcement', announcementId } } })),
    );
  }
}
