import { WebSocket } from 'ws';
import { wsConnectionsActive } from '../metrics/prometheus';

export interface ConnectionRecord {
  userId: string;
  socketId: string;
  socket: WebSocket;
  rooms: Set<string>;
  connectedAt: Date;
  lastHeartbeat: Date;
}

class ConnectionManager {
  private connections = new Map<string, ConnectionRecord>();
  private userIndex = new Map<string, Set<string>>();
  private rooms = new Map<string, Set<string>>();

  add(socketId: string, record: ConnectionRecord): void {
    this.connections.set(socketId, record);

    const sockets = this.userIndex.get(record.userId) ?? new Set<string>();
    sockets.add(socketId);
    this.userIndex.set(record.userId, sockets);

    wsConnectionsActive.set(this.connections.size);
  }

  remove(socketId: string): void {
    const record = this.connections.get(socketId);
    if (!record) return;

    for (const room of record.rooms) {
      this.removeFromRoom(socketId, room);
    }

    const sockets = this.userIndex.get(record.userId);
    sockets?.delete(socketId);
    if (sockets && sockets.size === 0) this.userIndex.delete(record.userId);

    this.connections.delete(socketId);
    wsConnectionsActive.set(this.connections.size);
  }

  get(socketId: string): ConnectionRecord | undefined {
    return this.connections.get(socketId);
  }

  all(): IterableIterator<[string, ConnectionRecord]> {
    return this.connections.entries();
  }

  getByUser(userId: string): ConnectionRecord[] {
    const socketIds = this.userIndex.get(userId);
    if (!socketIds) return [];
    return [...socketIds].map((id) => this.connections.get(id)).filter((c): c is ConnectionRecord => !!c);
  }

  isUserOnline(userId: string): boolean {
    return (this.userIndex.get(userId)?.size ?? 0) > 0;
  }

  addToRoom(socketId: string, room: string): void {
    const record = this.connections.get(socketId);
    if (!record) return;

    record.rooms.add(room);
    const members = this.rooms.get(room) ?? new Set<string>();
    members.add(socketId);
    this.rooms.set(room, members);
  }

  removeFromRoom(socketId: string, room: string): void {
    const record = this.connections.get(socketId);
    record?.rooms.delete(room);

    const members = this.rooms.get(room);
    members?.delete(socketId);
    if (members && members.size === 0) this.rooms.delete(room);
  }

  getRoom(room: string): ConnectionRecord[] {
    const socketIds = this.rooms.get(room);
    if (!socketIds) return [];
    return [...socketIds].map((id) => this.connections.get(id)).filter((c): c is ConnectionRecord => !!c);
  }
}

export const connectionManager = new ConnectionManager();
