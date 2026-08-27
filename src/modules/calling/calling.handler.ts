import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { connectionManager } from '../../websocket/connection.manager';
import { buildEvent } from '../../types/ws';
import * as callService from './call.service';
import { dispatchNotification } from '../../services/push-dispatcher.service';

function relayToUser(userId: string, type: string, payload: unknown, eventId: string): boolean {
  const sockets = connectionManager.getByUser(userId);
  if (sockets.length === 0) return false;

  const message = JSON.stringify(buildEvent(type, payload, eventId));
  for (const conn of sockets) conn.socket.send(message);
  return true;
}

const initiateSchema = z.object({ calleeId: z.string().uuid(), callType: z.enum(['audio', 'video']) });
const callIdSchema = z.object({ callId: z.string().uuid() });
const rejectSchema = z.object({ callId: z.string().uuid(), reason: z.string().max(200).optional() });
const sdpSchema = z.object({ callId: z.string().uuid(), sdp: z.unknown() });
const iceSchema = z.object({ callId: z.string().uuid(), candidate: z.unknown() });

const initiate: EventDefinition<z.infer<typeof initiateSchema>> = {
  schema: initiateSchema,
  handle: async (conn, payload, eventId) => {
    const call = await callService.createCall({
      type: payload.callType,
      initiatorId: conn.userId,
      calleeId: payload.calleeId,
    });

    const delivered = relayToUser(
      payload.calleeId,
      'call:ringing',
      { callId: call.id, callType: payload.callType, caller: conn.userId },
      eventId,
    );

    if (!delivered) {
      await dispatchNotification(payload.calleeId, {
        type: 'info',
        title: 'Incoming call',
        body: `Incoming ${payload.callType} call`,
        data: { callId: call.id, callerId: conn.userId },
      });
    }

    conn.socket.send(JSON.stringify(buildEvent('call:initiated', { callId: call.id })));
  },
};

const accept: EventDefinition<z.infer<typeof callIdSchema>> = {
  schema: callIdSchema,
  handle: async (conn, payload, eventId) => {
    const call = await callService.assertParticipant(payload.callId, conn.userId);
    await callService.updateStatus(payload.callId, 'active');
    await callService.recordEvent(payload.callId, 'accept');

    const caller = call.participants.find((p) => p.role === 'caller');
    if (caller) relayToUser(caller.userId, 'call:accept', { callId: payload.callId }, eventId);
  },
};

const reject: EventDefinition<z.infer<typeof rejectSchema>> = {
  schema: rejectSchema,
  handle: async (conn, payload, eventId) => {
    const call = await callService.assertParticipant(payload.callId, conn.userId);
    await callService.updateStatus(payload.callId, 'rejected');
    await callService.recordEvent(payload.callId, 'reject');

    const caller = call.participants.find((p) => p.role === 'caller');
    if (caller) {
      relayToUser(caller.userId, 'call:reject', { callId: payload.callId, reason: payload.reason }, eventId);
    }
  },
};

const sdpOffer: EventDefinition<z.infer<typeof sdpSchema>> = {
  schema: sdpSchema,
  handle: async (conn, payload, eventId) => {
    await callService.assertParticipant(payload.callId, conn.userId);
    const target = await callService.otherParticipant(payload.callId, conn.userId);
    if (target) relayToUser(target, 'call:sdp-offer', { callId: payload.callId, sdp: payload.sdp }, eventId);
  },
};

const sdpAnswer: EventDefinition<z.infer<typeof sdpSchema>> = {
  schema: sdpSchema,
  handle: async (conn, payload, eventId) => {
    await callService.assertParticipant(payload.callId, conn.userId);
    const target = await callService.otherParticipant(payload.callId, conn.userId);
    if (target) relayToUser(target, 'call:sdp-answer', { callId: payload.callId, sdp: payload.sdp }, eventId);
  },
};

const iceCandidate: EventDefinition<z.infer<typeof iceSchema>> = {
  schema: iceSchema,
  handle: async (conn, payload, eventId) => {
    await callService.assertParticipant(payload.callId, conn.userId);
    const target = await callService.otherParticipant(payload.callId, conn.userId);
    if (target) {
      relayToUser(target, 'call:ice-candidate', { callId: payload.callId, candidate: payload.candidate }, eventId);
    }
  },
};

const end: EventDefinition<z.infer<typeof callIdSchema>> = {
  schema: callIdSchema,
  handle: async (conn, payload, eventId) => {
    await callService.assertParticipant(payload.callId, conn.userId);
    await callService.updateStatus(payload.callId, 'ended');
    await callService.recordEvent(payload.callId, 'end');

    const target = await callService.otherParticipant(payload.callId, conn.userId);
    if (target) relayToUser(target, 'call:end', { callId: payload.callId }, eventId);
  },
};

export const callingHandlers: Record<string, EventDefinition<any>> = {
  'call:initiate': initiate,
  'call:accept': accept,
  'call:reject': reject,
  'call:sdp-offer': sdpOffer,
  'call:sdp-answer': sdpAnswer,
  'call:ice-candidate': iceCandidate,
  'call:end': end,
};
