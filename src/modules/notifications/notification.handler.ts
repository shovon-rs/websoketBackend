import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import * as notificationService from './notification.service';
import { buildEvent } from '../../types/ws';

const readSchema = z.object({ notificationId: z.string().uuid() });
const readAllSchema = z.object({});

const markRead: EventDefinition<z.infer<typeof readSchema>> = {
  schema: readSchema,
  handle: async (conn, payload) => {
    await notificationService.markRead(conn.userId, payload.notificationId);
    conn.socket.send(JSON.stringify(buildEvent('notification:read', { notificationId: payload.notificationId })));
  },
};

const markAllRead: EventDefinition<z.infer<typeof readAllSchema>> = {
  schema: readAllSchema,
  handle: async (conn) => {
    await notificationService.markAllRead(conn.userId);
    conn.socket.send(JSON.stringify(buildEvent('notification:read-all', {})));
  },
};

export const notificationHandlers: Record<string, EventDefinition<any>> = {
  'notification:read': markRead,
  'notification:read-all': markAllRead,
};
