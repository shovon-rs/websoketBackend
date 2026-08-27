import { connectionManager } from '../websocket/connection.manager';
import { buildEvent } from '../types/ws';
import { enqueuePush } from '../queue/push.queue';
import * as notificationService from '../modules/notifications/notification.service';
import type { NotificationSeverity } from '../modules/notifications/notification.service';

export interface DispatchNotificationParams {
  type: NotificationSeverity;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Persists the notification (so it survives reconnects and shows up in
 * `GET /api/notifications` history), then delivers it live over an open
 * WebSocket, or falls back to the offline push queue (FCM/APNs/Web Push)
 * when the user has no active connection.
 */
export async function dispatchNotification(userId: string, params: DispatchNotificationParams): Promise<void> {
  const notification = await notificationService.createNotification({ userId, ...params });

  const sockets = connectionManager.getByUser(userId);
  if (sockets.length > 0) {
    const event = buildEvent('notification:new', notification);
    const message = JSON.stringify(event);
    for (const conn of sockets) conn.socket.send(message);
    return;
  }

  await enqueuePush({ userId, payload: { title: params.title, body: params.body, data: params.data } });
}
