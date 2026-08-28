import { ZodError } from 'zod';
import { ConnectionRecord } from './connection.manager';
import { WsEvent, buildErrorEvent } from '../types/ws';
import { EventDefinition } from './event.types';
import { wsEventLatency } from '../metrics/prometheus';
import { logger } from '../utils/logger';
import { chatHandlers } from '../modules/chat/chat.handler';
import { notificationHandlers } from '../modules/notifications/notification.handler';
import { trackingHandlers } from '../modules/tracking/tracking.handler';
import { callingHandlers } from '../modules/calling/calling.handler';
import { dashboardHandlers } from '../modules/dashboard/dashboard.handler';
import { collaborationHandlers } from '../modules/collaboration/collaboration.handler';
import { livestreamHandlers } from '../modules/livestream/livestream.handler';

const handlers: Record<string, EventDefinition<any>> = {
  ...chatHandlers,
  ...notificationHandlers,
  ...trackingHandlers,
  ...callingHandlers,
  ...dashboardHandlers,
  ...collaborationHandlers,
  ...livestreamHandlers,
};

const MAX_PAYLOAD_BYTES = 64 * 1024;

export function sendError(conn: ConnectionRecord, code: string, message: string, eventId?: string): void {
  conn.socket.send(JSON.stringify(buildErrorEvent(code, message, eventId)));
}

export async function routeEvent(conn: ConnectionRecord, raw: WsEvent, rawSize: number): Promise<void> {
  const start = process.hrtime.bigint();

  if (rawSize > MAX_PAYLOAD_BYTES) {
    sendError(conn, 'PAYLOAD_TOO_LARGE', 'Message exceeds 64KB limit', raw.eventId);
    return;
  }

  const definition = handlers[raw.type];
  if (!definition) {
    sendError(conn, 'UNKNOWN_EVENT', `No handler registered for event type "${raw.type}"`, raw.eventId);
    return;
  }

  try {
    const payload = definition.schema.parse(raw.payload);
    await definition.handle(conn, payload, raw.eventId);
  } catch (err) {
    if (err instanceof ZodError) {
      sendError(conn, 'VALIDATION_ERROR', 'Payload failed validation', raw.eventId);
    } else {
      const code = err instanceof Error ? err.message : 'INTERNAL_ERROR';
      logger.error({ err, type: raw.type, userId: conn.userId }, 'Event handler failed');
      sendError(conn, code, 'Event could not be processed', raw.eventId);
    }
  } finally {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    wsEventLatency.observe({ event_type: raw.type }, durationMs);
    logger.info({ userId: conn.userId, socketId: conn.socketId, eventType: raw.type, durationMs }, 'Event processed');
  }
}
