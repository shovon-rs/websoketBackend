import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { verifyAccessToken } from '../services/auth.service';
import { connectionManager } from './connection.manager';
import { routeEvent, sendError } from './event.router';
import { startHeartbeat } from './heartbeat';
import { setPresence, clearPresence, refreshPresence } from '../redis/presence';
import { logger } from '../utils/logger';
import { wsConnectionsTotal } from '../metrics/prometheus';

const envelopeSchema = z.object({
  type: z.string().min(1),
  eventId: z.string().min(1),
  timestamp: z.string(),
  payload: z.unknown(),
});

const ALLOWED_ORIGINS = (process.env.WS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

function isOriginAllowed(origin: string | undefined): boolean {
  if (ALLOWED_ORIGINS.length === 0) return true; // unrestricted unless explicitly configured
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function extractToken(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice('Bearer '.length);

  return undefined;
}

export function attachWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!isOriginAllowed(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    const token = extractToken(req);
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let user;
    try {
      user = verifyAccessToken(token);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, user);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, user: { id: string; email: string; role: string }) => {
    const socketId = uuid();
    const record = {
      userId: user.id,
      socketId,
      socket: ws,
      rooms: new Set<string>(),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    connectionManager.add(socketId, record);
    wsConnectionsTotal.inc();
    setPresence(user.id).catch((err) => logger.error({ err }, 'Failed to set presence'));
    logger.info({ userId: user.id, socketId }, 'WebSocket connected');

    ws.on('pong', () => {
      record.lastHeartbeat = new Date();
      refreshPresence(user.id).catch(() => undefined);
    });

    ws.on('message', async (data, isBinary) => {
      if (isBinary) {
        sendError(record, 'UNSUPPORTED_FORMAT', 'Binary frames are not supported');
        return;
      }

      record.lastHeartbeat = new Date();
      const raw = data.toString();

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendError(record, 'INVALID_JSON', 'Message must be valid JSON');
        return;
      }

      const envelope = envelopeSchema.safeParse(parsed);
      if (!envelope.success) {
        sendError(record, 'INVALID_ENVELOPE', 'Message does not match the WsEvent envelope');
        return;
      }

      await routeEvent(record, envelope.data as any, Buffer.byteLength(raw));
    });

    ws.on('close', () => {
      connectionManager.remove(socketId);
      if (!connectionManager.isUserOnline(user.id)) {
        clearPresence(user.id).catch(() => undefined);
      }
      logger.info({ userId: user.id, socketId }, 'WebSocket disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ err, userId: user.id, socketId }, 'WebSocket error');
    });
  });

  startHeartbeat();
  return wss;
}
