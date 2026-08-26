import { WebSocket } from 'ws';
import { connectionManager } from './connection.manager';
import { logger } from '../utils/logger';

const PING_INTERVAL_MS = 25_000;
const STALE_AFTER_MS = 35_000;

export function startHeartbeat(): NodeJS.Timeout {
  return setInterval(() => {
    for (const [socketId, conn] of connectionManager.all()) {
      if (conn.socket.readyState !== WebSocket.OPEN) continue;

      const age = Date.now() - conn.lastHeartbeat.getTime();
      if (age > STALE_AFTER_MS) {
        logger.warn({ socketId, userId: conn.userId }, 'Terminating stale WebSocket connection');
        conn.socket.terminate();
        connectionManager.remove(socketId);
      } else {
        conn.socket.ping();
      }
    }
  }, PING_INTERVAL_MS);
}
