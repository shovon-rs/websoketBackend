import { prisma } from '../../config/database';

export async function createCall(params: { type: 'audio' | 'video'; initiatorId: string; calleeId: string }) {
  return prisma.call.create({
    data: {
      type: params.type,
      status: 'ringing',
      initiatorId: params.initiatorId,
      participants: {
        create: [
          { userId: params.initiatorId, role: 'caller', joinedAt: new Date() },
          { userId: params.calleeId, role: 'callee' },
        ],
      },
    },
    include: { participants: true },
  });
}

export async function getCall(callId: string) {
  return prisma.call.findUnique({ where: { id: callId }, include: { participants: true } });
}

export async function listCallsForUser(userId: string) {
  return prisma.call.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: {
        include: { user: { select: { id: true, displayName: true, email: true, avatarKey: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function countCallsSince(userId: string, since: Date): Promise<number> {
  return prisma.call.count({ where: { participants: { some: { userId } }, createdAt: { gte: since } } });
}

export async function assertParticipant(callId: string, userId: string) {
  const call = await getCall(callId);
  if (!call || !call.participants.some((p) => p.userId === userId)) throw new Error('FORBIDDEN');
  return call;
}

export async function otherParticipant(callId: string, userId: string): Promise<string | undefined> {
  const call = await getCall(callId);
  return call?.participants.find((p) => p.userId !== userId)?.userId;
}

// Single-fetch combination of assertParticipant + otherParticipant — signaling handlers
// (sdp-offer/sdp-answer/ice-candidate/end) need both on every message, and fetching the
// call row twice per message doubles DB round-trip latency on the signaling hot path
// (most visibly with ICE candidates, which arrive as a burst of several per call).
export async function assertParticipantWithTarget(
  callId: string,
  userId: string,
): Promise<{ call: NonNullable<Awaited<ReturnType<typeof getCall>>>; target: string | undefined }> {
  const call = await getCall(callId);
  if (!call || !call.participants.some((p) => p.userId === userId)) throw new Error('FORBIDDEN');
  const target = call.participants.find((p) => p.userId !== userId)?.userId;
  return { call, target };
}

export async function updateStatus(callId: string, status: string) {
  const timestamps =
    status === 'active' ? { startedAt: new Date() } : status === 'ended' ? { endedAt: new Date() } : {};
  return prisma.call.update({ where: { id: callId }, data: { status, ...timestamps } });
}

export async function recordEvent(callId: string, type: string) {
  return prisma.callEvent.create({ data: { callId, type } });
}
