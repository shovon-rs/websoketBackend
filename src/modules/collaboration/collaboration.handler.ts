import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import * as documentService from './document.service';

const documentRoom = (documentId: string) => `document:${documentId}`;

const joinSchema = z.object({ documentId: z.string().uuid() });
const updateSchema = z.object({ documentId: z.string().uuid(), content: z.string().max(200_000) });
const cursorSchema = z.object({ documentId: z.string().uuid(), position: z.number().int().nonnegative() });

const join: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn, payload) => {
    const document = await documentService.getDocument(payload.documentId);
    if (!document) throw new Error('DOCUMENT_NOT_FOUND');

    roomManager.join(conn.socketId, documentRoom(payload.documentId));
    conn.socket.send(JSON.stringify(buildEvent('document:state', { content: document.content })));
  },
};

const leave: EventDefinition<z.infer<typeof joinSchema>> = {
  schema: joinSchema,
  handle: async (conn, payload) => {
    roomManager.leave(conn.socketId, documentRoom(payload.documentId));
  },
};

const update: EventDefinition<z.infer<typeof updateSchema>> = {
  schema: updateSchema,
  handle: async (conn, payload, eventId) => {
    await documentService.saveVersion(payload.documentId, conn.userId, payload.content);
    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent('document:update', { documentId: payload.documentId, content: payload.content, authorId: conn.userId }, eventId),
    );
  },
};

const cursor: EventDefinition<z.infer<typeof cursorSchema>> = {
  schema: cursorSchema,
  handle: async (conn, payload, eventId) => {
    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent('document:cursor', { documentId: payload.documentId, userId: conn.userId, position: payload.position }, eventId),
    );
  },
};

export const collaborationHandlers: Record<string, EventDefinition<any>> = {
  'document:join': join,
  'document:leave': leave,
  'document:update': update,
  'document:cursor': cursor,
};
