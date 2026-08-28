import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { connectionManager } from '../../websocket/connection.manager';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import { assertRole } from '../../websocket/role.guard';
import { getIceServers } from '../calling/turn.service';
import * as livestreamService from './livestream.service';
import { liveRoom } from './livestream.service';

function relayToUser(userId: string, type: string, payload: unknown, eventId: string): boolean {
  const sockets = connectionManager.getByUser(userId);
  if (sockets.length === 0) return false;
  const message = JSON.stringify(buildEvent(type, payload, eventId));
  for (const conn of sockets) conn.socket.send(message);
  return true;
}

const announcementIdSchema = z.object({ announcementId: z.string().uuid() });
const signalSchema = z.object({
  announcementId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  sdp: z.unknown().optional(),
  candidate: z.unknown().optional(),
});

const join: EventDefinition<z.infer<typeof announcementIdSchema>> = {
  schema: announcementIdSchema,
  handle: async (conn, payload, eventId) => {
    const { announcement, session, role } = await livestreamService.assertLiveParticipant(
      payload.announcementId,
      conn.userId,
    );

    if (role === 'viewer') {
      livestreamService.assertViewerCapacity(payload.announcementId, announcement.broadcasterId!);
      await livestreamService.recordViewerJoin(session!.id, conn.userId);
    }

    roomManager.join(conn.socketId, liveRoom(payload.announcementId));

    conn.socket.send(
      JSON.stringify(
        buildEvent(
          'live:joined',
          {
            announcementId: payload.announcementId,
            iceServers: getIceServers(),
            broadcasterId: announcement.broadcasterId,
            viewerIds: livestreamService.currentViewerIds(payload.announcementId, announcement.broadcasterId!),
          },
          eventId,
        ),
      ),
    );

    if (role === 'viewer') {
      roomManager.broadcastToRoom(
        liveRoom(payload.announcementId),
        buildEvent('live:viewer-joined', { announcementId: payload.announcementId, userId: conn.userId }),
      );
    }
  },
};

const leave: EventDefinition<z.infer<typeof announcementIdSchema>> = {
  schema: announcementIdSchema,
  handle: async (conn, payload) => {
    const wasMember = livestreamService.isRoomMember(payload.announcementId, conn.userId);
    roomManager.leave(conn.socketId, liveRoom(payload.announcementId));
    if (!wasMember) return;

    const { session } = await livestreamService.assertLiveParticipant(payload.announcementId, conn.userId).catch(() => ({
      session: null,
    }));
    if (session) await livestreamService.recordViewerLeft(session.id, conn.userId);

    roomManager.broadcastToRoom(
      liveRoom(payload.announcementId),
      buildEvent('live:viewer-left', { announcementId: payload.announcementId, userId: conn.userId }),
    );
  },
};

function relaySignal(eventType: string) {
  const handler: EventDefinition<z.infer<typeof signalSchema>> = {
    schema: signalSchema,
    handle: async (conn, payload, eventId) => {
      const { announcement } = await livestreamService.assertLiveParticipant(payload.announcementId, conn.userId);

      const isCallerBroadcaster = announcement.broadcasterId === conn.userId;
      const targetIsValid = isCallerBroadcaster
        ? livestreamService.currentViewerIds(payload.announcementId, announcement.broadcasterId!).includes(
            payload.targetUserId,
          )
        : payload.targetUserId === announcement.broadcasterId;
      if (!targetIsValid) throw new Error('FORBIDDEN');

      // The relayed message carries fromUserId (not targetUserId) — the recipient needs to
      // know which of its (possibly several) peer connections this signal belongs to.
      relayToUser(
        payload.targetUserId,
        eventType,
        { announcementId: payload.announcementId, fromUserId: conn.userId, sdp: payload.sdp, candidate: payload.candidate },
        eventId,
      );
    },
  };
  return handler;
}

const end: EventDefinition<z.infer<typeof announcementIdSchema>> = {
  schema: announcementIdSchema,
  handle: async (conn, payload) => {
    const { announcement } = await livestreamService.assertLiveParticipant(payload.announcementId, conn.userId);

    if (announcement.broadcasterId !== conn.userId) {
      await assertRole(conn, 'super_admin');
    }

    await livestreamService.endSession(payload.announcementId);

    roomManager.broadcastToRoom(
      liveRoom(payload.announcementId),
      buildEvent('live:ended', { announcementId: payload.announcementId }),
    );
  },
};

export const livestreamHandlers: Record<string, EventDefinition<any>> = {
  'live:join': join,
  'live:leave': leave,
  'live:sdp-offer': relaySignal('live:sdp-offer'),
  'live:sdp-answer': relaySignal('live:sdp-answer'),
  'live:ice-candidate': relaySignal('live:ice-candidate'),
  'live:end': end,
};
