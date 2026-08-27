import { prisma } from '../../config/database';

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
}) {
  return prisma.message.create({ data: params });
}

export async function getMessageByEventId(eventId: string) {
  return prisma.message.findUnique({ where: { eventId } });
}

export async function getMessagesAfter(conversationId: string, afterEventId?: string, limit = 50) {
  let cursorCreatedAt: Date | undefined;

  if (afterEventId) {
    const cursorMessage = await prisma.message.findUnique({ where: { eventId: afterEventId } });
    cursorCreatedAt = cursorMessage?.createdAt;
  }

  return prisma.message.findMany({
    where: {
      conversationId,
      ...(cursorCreatedAt ? { createdAt: { gt: cursorCreatedAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
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
