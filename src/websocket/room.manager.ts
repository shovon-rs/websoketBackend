import { WsEvent } from '../types/ws';
import { publishToRoom } from '../redis/pub-sub';
import { connectionManager } from './connection.manager';

class RoomManager {
  /**
   * Publishes to Redis only — the pub/sub subscriber relays back to local
   * room members on every instance (including this one), so sending here
   * directly as well would double-deliver.
   */
  broadcastToRoom(room: string, event: WsEvent): void {
    publishToRoom(room, JSON.stringify(event));
  }

  join(socketId: string, room: string): void {
    connectionManager.addToRoom(socketId, room);
  }

  leave(socketId: string, room: string): void {
    connectionManager.removeFromRoom(socketId, room);
  }
}

export const roomManager = new RoomManager();
