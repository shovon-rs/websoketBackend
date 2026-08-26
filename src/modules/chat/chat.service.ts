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
    include: { members: true },
    orderBy: { createdAt: 'desc' },
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
