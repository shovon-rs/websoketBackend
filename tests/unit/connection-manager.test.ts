import { describe, expect, it, beforeEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { connectionManager } from '../../src/websocket/connection.manager';

function fakeSocket(): WebSocket {
  return { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

describe('ConnectionManager', () => {
  beforeEach(() => {
    // Drain any connections left over from a previous test.
    for (const [socketId] of connectionManager.all()) connectionManager.remove(socketId);
  });

  it('tracks a connection and reports the user online', () => {
    const socket = fakeSocket();
    connectionManager.add('socket-1', {
      userId: 'user-1',
      socketId: 'socket-1',
      socket,
      rooms: new Set(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });

    expect(connectionManager.isUserOnline('user-1')).toBe(true);
    expect(connectionManager.getByUser('user-1')).toHaveLength(1);
  });

  it('removes a connection and clears user presence when their last socket closes', () => {
    connectionManager.add('socket-1', {
      userId: 'user-1',
      socketId: 'socket-1',
      socket: fakeSocket(),
      rooms: new Set(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });

    connectionManager.remove('socket-1');

    expect(connectionManager.isUserOnline('user-1')).toBe(false);
    expect(connectionManager.getByUser('user-1')).toHaveLength(0);
  });

  it('scopes room membership so only joined sockets receive it', () => {
    connectionManager.add('socket-1', {
      userId: 'user-1',
      socketId: 'socket-1',
      socket: fakeSocket(),
      rooms: new Set(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });
    connectionManager.add('socket-2', {
      userId: 'user-2',
      socketId: 'socket-2',
      socket: fakeSocket(),
      rooms: new Set(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });

    connectionManager.addToRoom('socket-1', 'room-a');

    expect(connectionManager.getRoom('room-a')).toHaveLength(1);
    expect(connectionManager.getRoom('room-a')[0].socketId).toBe('socket-1');

    connectionManager.removeFromRoom('socket-1', 'room-a');
    expect(connectionManager.getRoom('room-a')).toHaveLength(0);
  });
});
