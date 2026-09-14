import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { roomManager } from '../../websocket/room.manager';
import { assertRole } from '../../websocket/role.guard';
import { buildEvent } from '../../types/ws';
import * as trackingService from './tracking.service';
import { checkWsRateLimit } from '../../redis/rate-limit';

const trackingRoom = (sessionId: string) => `tracking:${sessionId}`;

// Every super_admin who calls `tracking:admin:subscribe` joins this one room, so
// session start/stop/location events fan out to them without joining every
// individual session room (which would require them to already know each
// sessionId, and to re-join whenever a new one starts).
export const TRACKING_ADMIN_ROOM = 'tracking:admin';

const startSchema = z.object({});
const joinSchema = z.object({ sessionId: z.string().uuid() });
const stopSchema = z.object({ sessionId: z.string().uuid() });
const adminSubscribeSchema = z.object({});
const locationSchema = z.object({
  sessionId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const start: EventDefinition<z.infer<typeof startSchema>> = {
  schema: startSchema,
  handle: async (conn) => {
    const session = await trackingService.startSession(conn.userId);
    roomManager.join(conn.socketId, trackingRoom(session.id));
    conn.socket.send(JSON.stringify(buildEvent('tracking:started', { sessionId: session.id })));
    roomManager.broadcastToRoom(
      TRACKING_ADMIN_ROOM,
      buildEvent('admin:tracking:started', {
        sessionId: session.id,
        userId: session.userId,
        displayName: session.user.displayName,
        email: session.user.email,
        startedAt: session.startedAt,
      }),
    );
  },
};

const adminSubscribe: EventDefinition<z.infer<typeof adminSubscribeSchema>> = {
  schema: adminSubscribeSchema,
  handle: async (conn) => {
    await assertRole(conn, 'super_admin');
    roomManager.join(conn.socketId, TRACKING_ADMIN_ROOM);
  },
};

const adminUnsubscribe: EventDefinition<z.infer<typeof adminSubscribeSchema>> = {
  schema: adminSubscribeSchema,
  handle: async (conn) => {
    await assertRole(conn, 'super_admin');
    roomManager.leave(conn.socketId, TRACKING_ADMIN_ROOM);
  },
};

const join: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn, payload) => {
    // Authorized viewers only — see privacy §16: session owner or explicitly authorized viewer.
    await trackingService.assertCanView(payload.sessionId, conn.userId);
    roomManager.join(conn.socketId, trackingRoom(payload.sessionId));
  },
};

const stop: EventDefinition<z.infer<typeof stopSchema>> = {
  schema: stopSchema,
  handle: async (conn, payload) => {
    await trackingService.endSession(payload.sessionId, conn.userId);
    roomManager.broadcastToRoom(trackingRoom(payload.sessionId), buildEvent('tracking:stop', { sessionId: payload.sessionId }));
    roomManager.broadcastToRoom(TRACKING_ADMIN_ROOM, buildEvent('admin:tracking:stopped', { sessionId: payload.sessionId }));
  },
};

const update: EventDefinition<z.infer<typeof locationSchema>> = {
  schema: locationSchema,
  handle: async (conn, payload, eventId) => {
    const allowed = await checkWsRateLimit(conn.userId, 'location:update', 20, 10_000);
    if (!allowed) throw new Error('RATE_LIMITED');

    await trackingService.assertOwner(payload.sessionId, conn.userId);
    const location = await trackingService.recordLocation(payload.sessionId, payload.lat, payload.lng);

    roomManager.broadcastToRoom(
      trackingRoom(payload.sessionId),
      buildEvent('location:update', {
        sessionId: payload.sessionId,
        lat: location.lat,
        lng: location.lng,
        recordedAt: location.recordedAt,
      }, eventId),
    );
    roomManager.broadcastToRoom(
      TRACKING_ADMIN_ROOM,
      buildEvent('admin:location:update', {
        sessionId: payload.sessionId,
        userId: conn.userId,
        lat: location.lat,
        lng: location.lng,
        recordedAt: location.recordedAt,
      }, eventId),
    );
  },
};

export const trackingHandlers: Record<string, EventDefinition<any>> = {
  'tracking:start': start,
  'tracking:join': join,
  'tracking:stop': stop,
  'location:update': update,
  'tracking:admin:subscribe': adminSubscribe,
  'tracking:admin:unsubscribe': adminUnsubscribe,
};
