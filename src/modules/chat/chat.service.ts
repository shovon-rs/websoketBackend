import { prisma } from '../../config/database';
import * as storageService from '../../services/storage.service';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';

const USER_SELECT = { id: true, displayName: true, email: true } as const;
const MEMBERS_INCLUDE = { members: { include: { user: { select: USER_SELECT } } } } as const;

const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

export async function assertMember(conversationId: string, userId: string): Promise<void> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new Error('NOT_A_MEMBER');
}

/** Only a group's admin may rename it, add/remove members, or change another member's role. */
export async function assertAdmin(conversationId: string, userId: string): Promise<void> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member || member.role !== 'admin') throw new Error('FORBIDDEN');
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: { include: { user: { select: USER_SELECT } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getConversation(conversationId: string) {
  return prisma.conversation.findUnique({ where: { id: conversationId }, include: MEMBERS_INCLUDE });
}

/**
 * Direct conversations dedupe to the existing 1:1 thread and have no admin concept. A group
 * conversation always gets exactly one admin at creation time — its creator — mirroring
 * Messenger/WhatsApp; everyone else joins as a plain member.
 */
export async function createConversation(params: { creatorId: string; memberIds: string[]; type: 'direct' | 'group'; name?: string }) {
  const memberIds = [...new Set([params.creatorId, ...params.memberIds])];

  if (params.type === 'direct' && memberIds.length === 2) {
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: memberIds.map((userId) => ({ members: { some: { userId } } })),
      },
      include: MEMBERS_INCLUDE,
    });
    if (existing) return existing;
  }

  return prisma.conversation.create({
    data: {
      type: params.type,
      name: params.name,
      members: {
        create: memberIds.map((userId) => ({
          userId,
          role: params.type === 'group' && userId === params.creatorId ? 'admin' : 'member',
        })),
      },
    },
    include: MEMBERS_INCLUDE,
  });
}

export async function renameConversation(conversationId: string, name: string) {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { name },
    include: MEMBERS_INCLUDE,
  });
  roomManager.broadcastToRoom(conversationRoom(conversationId), buildEvent('conversation:updated', { conversationId, name }));
  return conversation;
}

export async function addMembers(conversationId: string, newMemberIds: string[]) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { members: true } });
  if (!conversation) throw new Error('NOT_FOUND');
  if (conversation.type !== 'group') throw new Error('NOT_A_GROUP');

  const existingIds = new Set(conversation.members.map((m) => m.userId));
  const toAdd = newMemberIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await prisma.conversationMember.createMany({ data: toAdd.map((userId) => ({ conversationId, userId, role: 'member' })) });
  }

  const updated = await getConversation(conversationId);
  if (toAdd.length > 0) {
    roomManager.broadcastToRoom(
      conversationRoom(conversationId),
      buildEvent('conversation:members-added', {
        conversationId,
        members: updated!.members.filter((m) => toAdd.includes(m.userId)),
      }),
    );
  }
  return updated;
}

/**
 * A member may remove only themself (leave); an admin may remove anyone. If that removal
 * leaves the group with members but no remaining admin, the earliest-joined survivor is
 * auto-promoted — otherwise the group would become permanently unmanageable, same as
 * Messenger/WhatsApp's behavior when the sole admin leaves.
 */
export async function removeMember(conversationId: string, targetUserId: string, actorId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { members: true } });
  if (!conversation) throw new Error('NOT_FOUND');
  if (conversation.type !== 'group') throw new Error('NOT_A_GROUP');

  const actorMember = conversation.members.find((m) => m.userId === actorId);
  if (!actorMember) throw new Error('FORBIDDEN');

  const isSelfLeaving = targetUserId === actorId;
  if (!isSelfLeaving && actorMember.role !== 'admin') throw new Error('FORBIDDEN');

  const targetMember = conversation.members.find((m) => m.userId === targetUserId);
  if (!targetMember) throw new Error('NOT_FOUND');

  await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId: targetUserId } } });

  const remaining = conversation.members.filter((m) => m.userId !== targetUserId);
  const hasRemainingAdmin = remaining.some((m) => m.role === 'admin');
  let promotedAdminId: string | null = null;

  if (remaining.length > 0 && !hasRemainingAdmin) {
    const nextAdmin = [...remaining].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: nextAdmin.userId } },
      data: { role: 'admin' },
    });
    promotedAdminId = nextAdmin.userId;
  }

  roomManager.broadcastToRoom(
    conversationRoom(conversationId),
    buildEvent('conversation:member-removed', { conversationId, userId: targetUserId, promotedAdminId }),
  );

  return { promotedAdminId };
}

/** Demoting the last remaining admin is refused — a group must always have at least one. */
export async function updateMemberRole(conversationId: string, targetUserId: string, role: 'admin' | 'member') {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { members: true } });
  if (!conversation) throw new Error('NOT_FOUND');
  if (conversation.type !== 'group') throw new Error('NOT_A_GROUP');

  const target = conversation.members.find((m) => m.userId === targetUserId);
  if (!target) throw new Error('NOT_FOUND');

  if (role === 'member' && target.role === 'admin') {
    const otherAdmins = conversation.members.filter((m) => m.role === 'admin' && m.userId !== targetUserId);
    if (otherAdmins.length === 0) throw new Error('LAST_ADMIN');
  }

  await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: targetUserId } }, data: { role } });

  roomManager.broadcastToRoom(
    conversationRoom(conversationId),
    buildEvent('conversation:member-role-changed', { conversationId, userId: targetUserId, role }),
  );
}

export async function getMembersWithUser(conversationId: string) {
  return prisma.conversationMember.findMany({
    where: { conversationId },
    include: { user: { select: { id: true, displayName: true } } },
  });
}

export async function createMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  eventId: string;
  attachmentId?: string;
}) {
  return prisma.message.create({ data: params, include: { attachment: true } });
}

export async function getMessageByEventId(eventId: string) {
  return prisma.message.findUnique({ where: { eventId } });
}

async function withAttachmentUrl<T extends { attachment: { key: string } | null }>(
  message: T,
): Promise<Omit<T, 'attachment'> & { attachment: (T['attachment'] & { url: string }) | null }> {
  if (!message.attachment) return { ...message, attachment: null };
  const url = await storageService.getDownloadUrl(message.attachment.key);
  return { ...message, attachment: { ...message.attachment, url } };
}

export async function getMessagesAfter(conversationId: string, afterEventId?: string, limit = 50) {
  let cursorCreatedAt: Date | undefined;

  if (afterEventId) {
    const cursorMessage = await prisma.message.findUnique({ where: { eventId: afterEventId } });
    cursorCreatedAt = cursorMessage?.createdAt;
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursorCreatedAt ? { createdAt: { gt: cursorCreatedAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { attachment: true },
  });

  return Promise.all(messages.map(withAttachmentUrl));
}

export async function createAttachment(params: {
  conversationId: string;
  uploaderId: string;
  bucket: string;
  key: string;
  mimeType: string;
  size: number;
  fileName: string;
}) {
  return prisma.attachment.create({ data: params });
}

export async function getAttachmentById(attachmentId: string) {
  return prisma.attachment.findUnique({ where: { id: attachmentId } });
}

export async function isAttachmentUsed(attachmentId: string): Promise<boolean> {
  const message = await prisma.message.findUnique({ where: { attachmentId }, select: { id: true } });
  return message !== null;
}

export async function markDelivered(eventId: string) {
  return prisma.message.updateMany({ where: { eventId, status: 'sent' }, data: { status: 'delivered' } });
}

export async function markRead(conversationId: string, userId: string) {
  const lastReadAt = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt },
  });
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      status: { in: ['sent', 'delivered'] },
    },
    data: { status: 'read' },
  });
  return lastReadAt;
}
