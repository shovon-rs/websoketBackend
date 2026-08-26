import { connectionManager } from '../websocket/connection.manager';
import { buildEvent } from '../types/ws';
import { enqueuePush } from '../queue/push.queue';

export interface DispatchPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Delivers over an open WebSocket when the user is online; otherwise falls
 * back to the offline push queue (FCM/APNs/Web Push).
 */
export async function dispatchNotification(userId: string, eventType: string, payload: DispatchPayload): Promise<void> {
  const sockets = connectionManager.getByUser(userId);

  if (sockets.length > 0) {
    const event = buildEvent(eventType, payload);
    const message = JSON.stringify(event);
    for (const conn of sockets) conn.socket.send(message);
    return;
  }

  await enqueuePush({ userId, payload });
}
