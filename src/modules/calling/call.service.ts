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

export async function assertParticipant(callId: string, userId: string) {
  const call = await getCall(callId);
  if (!call || !call.participants.some((p) => p.userId === userId)) throw new Error('FORBIDDEN');
  return call;
}

export async function otherParticipant(callId: string, userId: string): Promise<string | undefined> {
  const call = await getCall(callId);
  return call?.participants.find((p) => p.userId !== userId)?.userId;
}

export async function updateStatus(callId: string, status: string) {
  const timestamps =
    status === 'active' ? { startedAt: new Date() } : status === 'ended' ? { endedAt: new Date() } : {};
  return prisma.call.update({ where: { id: callId }, data: { status, ...timestamps } });
}

export async function recordEvent(callId: string, type: string) {
  return prisma.callEvent.create({ data: { callId, type } });
}
