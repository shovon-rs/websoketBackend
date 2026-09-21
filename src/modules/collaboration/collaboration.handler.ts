import { z } from 'zod';
import { EventDefinition } from '../../websocket/event.types';
import { roomManager } from '../../websocket/room.manager';
import { buildEvent } from '../../types/ws';
import { prisma } from '../../config/database';
import * as documentService from './document.service';
import * as documentSyncService from './document-sync.service';

const documentRoom = (documentId: string) => `document:${documentId}`;

/**
 * WS handlers don't have Express's req.user — fetch the caller's current role/displayName
 * fresh from the DB (mirrors role.guard.ts's assertRole, which re-checks the DB rather than
 * trusting a cached value on the connection).
 */
async function loadActor(userId: string): Promise<{ id: string; email: string; role: string; displayName: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true, displayName: true } });
  if (!user) throw new Error('FORBIDDEN');
  return { id: userId, email: user.email, role: user.role, displayName: user.displayName };
}

const documentJoinSchema = z.object({ documentId: z.string().uuid() });
const documentLeaveSchema = z.object({ documentId: z.string().uuid() });
const documentUpdateSchema = z.object({ documentId: z.string().uuid(), update: z.string().max(500_000) });
const documentAwarenessSchema = z.object({ documentId: z.string().uuid(), awareness: z.string().max(50_000) });

const join: EventDefinition<z.infer<typeof documentJoinSchema>> = {
  schema: documentJoinSchema,
  handle: async (conn, payload) => {
    const actor = await loadActor(conn.userId);
    const document = await documentService.assertCanView(payload.documentId, actor);

    roomManager.join(conn.socketId, documentRoom(payload.documentId));

    const doc = await documentSyncService.getOrLoadDoc(payload.documentId);
    const state = documentSyncService.encodeCurrentState(doc);
    const role =
      document.ownerId === conn.userId
        ? 'owner'
        : (document.collaborators.find((c) => c.userId === conn.userId)?.role ?? 'editor');

    conn.socket.send(
      JSON.stringify(
        buildEvent('document:state', {
          documentId: payload.documentId,
          state: Buffer.from(state).toString('base64'),
          title: document.title,
          role,
        }),
      ),
    );

    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent('document:presence', {
        documentId: payload.documentId,
        userId: conn.userId,
        displayName: actor.displayName,
        joined: true,
      }),
    );
  },
};

const leave: EventDefinition<z.infer<typeof documentLeaveSchema>> = {
  schema: documentLeaveSchema,
  handle: async (conn, payload) => {
    roomManager.leave(conn.socketId, documentRoom(payload.documentId));

    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent('document:presence', { documentId: payload.documentId, userId: conn.userId, joined: false }),
    );

    await documentSyncService.flushPersist(payload.documentId);
  },
};

const update: EventDefinition<z.infer<typeof documentUpdateSchema>> = {
  schema: documentUpdateSchema,
  handle: async (conn, payload, eventId) => {
    const actor = await loadActor(conn.userId);
    await documentService.assertCanEdit(payload.documentId, actor);

    await documentSyncService.applyClientUpdate(payload.documentId, payload.update);

    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent(
        'document:update',
        { documentId: payload.documentId, update: payload.update, authorId: conn.userId },
        eventId,
      ),
    );
  },
};

const awareness: EventDefinition<z.infer<typeof documentAwarenessSchema>> = {
  schema: documentAwarenessSchema,
  handle: async (conn, payload, eventId) => {
    const actor = await loadActor(conn.userId);
    await documentService.assertCanView(payload.documentId, actor);

    roomManager.broadcastToRoom(
      documentRoom(payload.documentId),
      buildEvent(
        'document:awareness',
        { documentId: payload.documentId, awareness: payload.awareness, userId: conn.userId },
        eventId,
      ),
    );
  },
};

export const collaborationHandlers: Record<string, EventDefinition<any>> = {
  'document:join': join,
  'document:leave': leave,
  'document:update': update,
  'document:awareness': awareness,
};
