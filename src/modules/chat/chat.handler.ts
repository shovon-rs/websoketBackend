import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import { EventDefinition } from '../../websocket/event.types';
import * as chatService from './chat.service';
import { logger } from '../../utils/logger';

const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

const joinSchema = z.object({ conversationId: z.string().uuid() });
const leaveSchema = z.object({ conversationId: z.string().uuid() });
const sendSchema = z.object({ conversationId: z.string().uuid(), content: z.string().min(1).max(4000) });
const ackSchema = z.object({ eventId: z.string() });
const typingSchema = z.object({ conversationId: z.string().uuid() });

const join: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn, payload) => {
    await chatService.assertMember(payload.conversationId, conn.userId);
    roomManager.join(conn.socketId, conversationRoom(payload.conversationId));
    conn.socket.send(JSON.stringify(buildEvent('chat:joined', { conversationId: payload.conversationId })));
  },
};

const leave: EventDefinition<z.infer<typeof leaveSchema>> = {
  schema: leaveSchema,
  handle: async (conn, payload) => {
    roomManager.leave(conn.socketId, conversationRoom(payload.conversationId));
  },
};

const send: EventDefinition<z.infer<typeof sendSchema>> = {
  schema: sendSchema,
  handle: async (conn, payload, eventId) => {
    await chatService.assertMember(payload.conversationId, conn.userId);

    // Persist before broadcast so message history is durable even if broadcast fails.
    const message = await chatService.createMessage({
      conversationId: payload.conversationId,
      senderId: conn.userId,
      content: payload.content,
      eventId,
    });

    roomManager.broadcastToRoom(
      conversationRoom(payload.conversationId),
      buildEvent('message:new', {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt,
      }, eventId),
    );
  },
};

const ack: EventDefinition<z.infer<typeof ackSchema>> = {
  schema: ackSchema,
  handle: async (_conn, payload) => {
    await chatService.markDelivered(payload.eventId).catch((err) => {
      logger.warn({ err, eventId: payload.eventId }, 'Failed to mark message delivered');
    });
  },
};

const typingStart: EventDefinition<z.infer<typeof typingSchema>> = {
  schema: typingSchema,
  handle: async (conn, payload) => {
    roomManager.broadcastToRoom(
      conversationRoom(payload.conversationId),
      buildEvent('typing:start', { conversationId: payload.conversationId, userId: conn.userId }, uuid()),
    );
  },
};

const typingStop: EventDefinition<z.infer<typeof typingSchema>> = {
  schema: typingSchema,
  handle: async (conn, payload) => {
    roomManager.broadcastToRoom(
      conversationRoom(payload.conversationId),
      buildEvent('typing:stop', { conversationId: payload.conversationId, userId: conn.userId }, uuid()),
    );
  },
};

export const chatHandlers: Record<string, EventDefinition<any>> = {
  'chat:join': join,
  'chat:leave': leave,
  'message:send': send,
  'message:ack': ack,
  'typing:start': typingStart,
  'typing:stop': typingStop,
};
