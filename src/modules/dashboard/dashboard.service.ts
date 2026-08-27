import { prisma } from '../../config/database';

export async function countConversations(userId: string): Promise<number> {
  return prisma.conversation.count({ where: { members: { some: { userId } } } });
}

const DAY_MS = 86_400_000;

/** Daily message counts for the last `days` days, across every conversation the user belongs to. */
export async function getMessageActivity(userId: string, days = 7) {
  const since = new Date(Date.now() - (days - 1) * DAY_MS);
  since.setHours(0, 0, 0, 0);

  const messages = await prisma.message.findMany({
    where: { conversation: { members: { some: { userId } } }, createdAt: { gte: since } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY_MS);
    buckets.set(date.toISOString().slice(0, 10), 0);
  }

  for (const message of messages) {
    const dayKey = message.createdAt.toISOString().slice(0, 10);
    if (buckets.has(dayKey)) buckets.set(dayKey, (buckets.get(dayKey) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
