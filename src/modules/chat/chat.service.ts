import { prisma } from '../../config/database';
import * as storageService from '../../services/storage.service';

export async function assertMember(conversationId: string, userId: string): Promise<void> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new Error('NOT_A_MEMBER');
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: { include: { user: { select: { id: true, displayName: true, email: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createConversation(params: { creatorId: string; memberIds: string[]; type: 'direct' | 'group'; name?: string }) {
  const memberIds = [...new Set([params.creatorId, ...params.memberIds])];

  if (params.type === 'direct' && memberIds.length === 2) {
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: memberIds.map((userId) => ({ members: { some: { userId } } })),
      },
      include: { members: { include: { user: { select: { id: true, displayName: true, email: true } } } } },
    });
    if (existing) return existing;
  }

  return prisma.conversation.create({
    data: {
      type: params.type,
      name: params.name,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { members: { include: { user: { select: { id: true, displayName: true, email: true } } } } },
  });
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
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
  return prisma.message.updateMany({
    where: { conversationId, status: { in: ['sent', 'delivered'] } },
    data: { status: 'read' },
  });
}
