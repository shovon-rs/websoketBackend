import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { createApp } from '../../src/app';
import { attachWebSocketServer } from '../../src/websocket/websocket.server';
import { prisma } from '../../src/config/database';
import { issueTokenPair } from '../../src/services/auth.service';
import { hashPassword } from '../../src/services/auth.service';

let httpServer: Server;
let baseUrl: string;
let userId: string;
let accessToken: string;
let conversationId: string;
const email = `ws-test-${Date.now()}@example.com`;

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitForEventType(ws: WebSocket, type: string): Promise<any> {
  return new Promise((resolve) => {
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === type) resolve(event);
    });
  });
}

describe('chat over WebSocket', () => {
  beforeAll(async () => {
    const app = createApp();
    httpServer = createServer(app);
    attachWebSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `ws://localhost:${port}`;

    const user = await prisma.user.create({
      data: { email, displayName: 'WS Test', passwordHash: await hashPassword('password123') },
    });
    userId = user.id;
    const tokens = await issueTokenPair({ id: user.id, email: user.email, role: user.role });
    accessToken = tokens.accessToken;

    const conversation = await prisma.conversation.create({ data: { type: 'direct' } });
    conversationId = conversation.id;
    await prisma.conversationMember.create({ data: { conversationId, userId } });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversationMember.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
    httpServer.close();
  });

  it('joins a conversation and receives a broadcast message in real time', async () => {
    const client = new WebSocket(`${baseUrl}/ws?token=${accessToken}`);
    await waitForOpen(client);

    client.send(
      JSON.stringify({
        type: 'chat:join',
        eventId: uuid(),
        timestamp: new Date().toISOString(),
        payload: { conversationId },
      }),
    );
    await waitForEventType(client, 'chat:joined');

    const received = waitForEventType(client, 'message:new');

    client.send(
      JSON.stringify({
        type: 'message:send',
        eventId: uuid(),
        timestamp: new Date().toISOString(),
        payload: { conversationId, content: 'Hello' },
      }),
    );

    const event = await received;
    expect(event.payload.content).toBe('Hello');

    client.close();
  });
});
