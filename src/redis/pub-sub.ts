import { redisPublisher, redisSubscriber } from '../config/redis';
import { connectionManager } from '../websocket/connection.manager';
import { logger } from '../utils/logger';
import { WebSocket } from 'ws';

const ROOM_CHANNEL_PREFIX = 'room:';

// Each server instance subscribes once; local connections in the room receive the relayed frame.
redisSubscriber.psubscribe(`${ROOM_CHANNEL_PREFIX}*`, (err) => {
  if (err) logger.error({ err }, 'Failed to subscribe to room channels');
});

redisSubscriber.on('pmessage', (_pattern, channel, message) => {
  const room = channel.slice(ROOM_CHANNEL_PREFIX.length);
  for (const conn of connectionManager.getRoom(room)) {
    if (conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(message);
    }
  }
});

export function publishToRoom(room: string, payload: string): void {
  redisPublisher.publish(`${ROOM_CHANNEL_PREFIX}${room}`, payload).catch((err) => {
    logger.error({ err, room }, 'Failed to publish to room channel');
  });
}
