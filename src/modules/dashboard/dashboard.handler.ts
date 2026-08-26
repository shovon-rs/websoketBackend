import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';

export const DASHBOARD_ROOM = 'dashboard:global';

const joinSchema = z.object({});

const join: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn) => {
    roomManager.join(conn.socketId, DASHBOARD_ROOM);
    conn.socket.send(JSON.stringify(buildEvent('dashboard:joined', {})));
  },
};

const leave: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn) => {
    roomManager.leave(conn.socketId, DASHBOARD_ROOM);
  },
};

export const dashboardHandlers: Record<string, EventDefinition<any>> = {
  'dashboard:join': join,
  'dashboard:leave': leave,
};

export function broadcastDashboardMetrics(metrics: Record<string, unknown>): void {
  roomManager.broadcastToRoom(DASHBOARD_ROOM, buildEvent('dashboard:metrics', metrics));
}

export function broadcastDashboardActivity(activity: Record<string, unknown>): void {
  roomManager.broadcastToRoom(DASHBOARD_ROOM, buildEvent('dashboard:activity', activity));
}

export function broadcastDashboardAlert(alert: Record<string, unknown>): void {
  roomManager.broadcastToRoom(DASHBOARD_ROOM, buildEvent('dashboard:alert', alert));
}
