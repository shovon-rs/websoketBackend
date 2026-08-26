# Real-Time Communication Platform — Backend Guide

**Stack:** Node.js · Express.js · TypeScript · WebSocket (ws) · PostgreSQL · Redis · WebRTC Signaling  
**Related:** [project-overview.md](./project-overview.md) · [frontend.md](./frontend.md)

---

## 1. Technology Stack

| Area | Technology | Version / Notes |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| HTTP Framework | Express.js | v4 / v5 |
| Real-Time | ws (WebSocket) | Handles upgrade from HTTP |
| Language | TypeScript | Strict mode |
| Database | PostgreSQL | 16+ |
| ORM / Migrations | Prisma | Schema-first, auto migrations |
| Cache / Pub-Sub | Redis | 7+ — Sentinel or Cluster for HA |
| Push Notifications | FCM (firebase-admin) + Web Push (web-push) | Offline delivery fallback |
| Job Queue | BullMQ | Redis-backed push dispatch queue |
| File Storage | S3-compatible (AWS SDK v3 / MinIO) | Attachments and recordings |
| Auth | jsonwebtoken + bcrypt | JWT access + refresh tokens |
| Validation | Zod | All REST and WebSocket payloads |
| API Docs | swagger-ui-express + zod-to-openapi | OpenAPI 3.1 served at `/api/docs` |
| Metrics | prom-client | Exposes `/metrics` for Prometheus |
| Logging | Pino | Structured JSON logs |
| Testing | Vitest + Supertest | Unit and integration tests |
| Load Testing | k6 | WebSocket and HTTP load tests |
| Containerization | Docker + Docker Compose | Dev and production environments |
| Reverse Proxy | Nginx | TLS termination + sticky sessions |

---

## 2. Project Structure

```
realtime-platform/
├── src/
│   ├── config/
│   │   ├── env.ts              # Zod-parsed environment variables
│   │   ├── database.ts         # Prisma client singleton
│   │   └── redis.ts            # Redis client + pub/sub channels
│   ├── app.ts                  # Express app factory
│   ├── server.ts               # HTTP server + WebSocket upgrade
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── chat.routes.ts
│   │   ├── notifications.routes.ts
│   │   ├── tracking.routes.ts
│   │   ├── calls.routes.ts
│   │   └── push.routes.ts
│   ├── controllers/
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── chat.service.ts
│   │   ├── notification.service.ts
│   │   ├── tracking.service.ts
│   │   ├── call.service.ts
│   │   └── push-dispatcher.service.ts
│   ├── repositories/           # All DB queries go here — no Prisma in controllers
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── validate.middleware.ts
│   │   └── metrics.middleware.ts
│   ├── websocket/
│   │   ├── websocket.server.ts  # Upgrade handler, auth, keep-alive
│   │   ├── connection.manager.ts
│   │   ├── room.manager.ts
│   │   ├── event.router.ts
│   │   └── heartbeat.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── notifications/
│   │   ├── dashboard/
│   │   ├── collaboration/
│   │   ├── tracking/
│   │   └── calling/
│   │       ├── calling.handler.ts   # WebSocket signaling events
│   │       ├── call.service.ts
│   │       └── turn.service.ts      # Fetches TURN credentials from env/API
│   ├── redis/
│   │   ├── pub-sub.ts
│   │   ├── presence.ts
│   │   └── rate-limit.ts
│   ├── queue/
│   │   └── push.queue.ts            # BullMQ worker for FCM/APNs/Web Push
│   ├── database/
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   ├── metrics/
│   │   └── prometheus.ts            # prom-client registry + custom metrics
│   ├── types/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/
│       └── ws-load.js               # k6 script
├── docs/
│   └── openapi.yaml
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 3. WebSocket Event Contract

All WebSocket messages share one envelope:

```typescript
interface WsEvent {
  type: string;          // e.g. 'message:new', 'location:update'
  eventId: string;       // UUID — used for ack and deduplication
  timestamp: string;     // ISO-8601
  payload: unknown;      // Feature-specific; validated by Zod per type
  error?: {
    code: string;
    message: string;
  };
}
```

Validate every inbound message with a Zod schema before passing it to a handler. Reject and respond with an error envelope rather than crashing the handler.

---

## 4. Connection Manager

```typescript
// websocket/connection.manager.ts
interface ConnectionRecord {
  userId: string;
  socketId: string;       // uuid assigned on connect
  socket: WebSocket;
  rooms: Set<string>;
  connectedAt: Date;
  lastHeartbeat: Date;
}

class ConnectionManager {
  private connections = new Map<string, ConnectionRecord>(); // socketId → record
  private userIndex = new Map<string, Set<string>>();        // userId → Set<socketId>

  add(socketId: string, record: ConnectionRecord): void { ... }
  remove(socketId: string): void { ... }
  getByUser(userId: string): ConnectionRecord[] { ... }
  isUserOnline(userId: string): boolean { ... }
  addToRoom(socketId: string, room: string): void { ... }
  removeFromRoom(socketId: string, room: string): void { ... }
  getRoom(room: string): ConnectionRecord[] { ... }
}
```

On disconnect, clean up rooms and update Redis presence keys.

---

## 5. Room Manager & Event Router

```typescript
// websocket/room.manager.ts
class RoomManager {
  broadcastToRoom(room: string, event: WsEvent, excludeSocketId?: string): void {
    const members = connectionManager.getRoom(room);
    const payload = JSON.stringify(event);
    for (const m of members) {
      if (m.socketId !== excludeSocketId && m.socket.readyState === WebSocket.OPEN) {
        m.socket.send(payload);
      }
    }
    // Also publish to Redis so other instances can relay
    redisPubSub.publish(room, payload);
  }
}
```

The Event Router maps incoming `type` values to module handlers:

```typescript
// websocket/event.router.ts
const handlers: Record<string, (conn: ConnectionRecord, event: WsEvent) => Promise<void>> = {
  'chat:join':        chatHandler.join,
  'message:send':     chatHandler.send,
  'notification:read': notificationHandler.markRead,
  'location:update':  trackingHandler.update,
  'call:initiate':    callingHandler.initiate,
  'call:sdp-offer':   callingHandler.sdpOffer,
  'call:ice-candidate': callingHandler.iceCandidate,
  // ...
};

export async function routeEvent(conn: ConnectionRecord, raw: WsEvent): Promise<void> {
  const handler = handlers[raw.type];
  if (!handler) { sendError(conn, 'UNKNOWN_EVENT'); return; }
  await handler(conn, raw);
}
```

---

## 6. Heartbeat

Send `ping` frames every 25 s and expect a `pong` back within 10 s. If no pong arrives, terminate the socket and let the client reconnect.

```typescript
// websocket/heartbeat.ts
setInterval(() => {
  for (const [socketId, conn] of connectionManager.all()) {
    if (conn.socket.readyState !== WebSocket.OPEN) continue;
    const age = Date.now() - conn.lastHeartbeat.getTime();
    if (age > 35_000) {
      conn.socket.terminate();
      connectionManager.remove(socketId);
    } else {
      conn.socket.ping();
    }
  }
}, 25_000);
```

---

## 7. Redis Architecture

### Pub/Sub — Cross-Instance Event Distribution

```typescript
// redis/pub-sub.ts
const publisher = createRedisClient();
const subscriber = createRedisClient();

subscriber.subscribe('room:*', (message, channel) => {
  const roomName = channel.replace('room:', '');
  const event: WsEvent = JSON.parse(message);
  // Relay to local connections in this room
  connectionManager.getRoom(roomName).forEach((conn) => {
    conn.socket.send(message);
  });
});

export function publish(room: string, payload: string): void {
  publisher.publish(`room:${room}`, payload);
}
```

### Presence Keys

```
key:  presence:{userId}
type: string ('online' | 'away')
TTL:  60 s (refreshed on heartbeat ack)
```

### Rate-Limit Counters

Use a sliding-window algorithm backed by Redis sorted sets or an atomic Lua script. Apply to both REST (`express-rate-limit` with Redis store) and WebSocket events.

### High Availability

**Never run single-instance Redis in production.**

- **Redis Sentinel** — primary + 2 replicas + 3 sentinels. Automatic failover in ~10–30 s. Use `ioredis` with sentinel config:
  ```typescript
  const redis = new Redis({ sentinels: [...], name: 'mymaster' });
  ```
- **Redis Cluster** — 3+ primaries with replicas. Supports horizontal sharding. Use when single-instance memory or throughput is a bottleneck.

---

## 8. WebSocket Load Balancing (Nginx)

WebSocket connections are long-lived and stateful. Ordinary round-robin load balancing causes problems because a reconnect may land on a different server instance, losing in-flight session state.

**Use sticky sessions at the load balancer layer:**

```nginx
# nginx.conf
upstream realtime_backend {
    ip_hash;                          # Route by client IP — simplest approach
    server node1:3000;
    server node2:3000;
    server node3:3000;
    keepalive 64;
}

server {
    listen 443 ssl;
    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location /ws {
        proxy_pass http://realtime_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;     # Keep alive for WS connections
    }

    location /api {
        proxy_pass http://realtime_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

> For cloud load balancers (AWS ALB, GCP), enable "session stickiness" / "sticky sessions" in the target group settings. Cookie-based stickiness is preferred when multiple users share the same IP (corporate NAT).

Redis Pub/Sub distributes events across instances, but it does **not** replace sticky sessions — the two work together.

---

## 9. Message Delivery Guarantees

The platform implements **at-least-once** delivery:

1. The server persists the message to PostgreSQL **before** broadcasting it.
2. The client sends a `message:ack` with the `eventId` upon receipt.
3. If no ack arrives within a configurable timeout (e.g., 10 s), the server may retry delivery up to N times.
4. `eventId` is stored on the client; duplicates are silently discarded.
5. On WebSocket reconnect, the client sends `GET /api/conversations/:id/messages?after=<lastEventId>` to fetch any missed messages.
6. Messages sent while a recipient has no open WebSocket are stored in PostgreSQL and replayed on reconnect, or delivered via push notification for high-priority events.

---

## 10. Push Notification Dispatcher

```typescript
// services/push-dispatcher.service.ts

async function dispatchNotification(userId: string, payload: PushPayload): Promise<void> {
  const isOnline = connectionManager.isUserOnline(userId);

  if (isOnline) {
    // Deliver over existing WebSocket
    connectionManager.getByUser(userId).forEach((conn) => {
      conn.socket.send(JSON.stringify({ type: 'notification:new', payload }));
    });
    return;
  }

  // User is offline — enqueue push job
  await pushQueue.add('send-push', { userId, payload });
}
```

```typescript
// queue/push.queue.ts (BullMQ worker)
pushWorker.process(async (job) => {
  const { userId, payload } = job.data;
  const tokens = await pushTokenRepo.getByUser(userId);

  for (const token of tokens) {
    if (token.platform === 'fcm') await sendFcm(token.token, payload);
    if (token.platform === 'apns') await sendApns(token.token, payload);
    if (token.platform === 'web') await sendWebPush(token.subscription, payload);
  }
});
```

Register/unregister push tokens via `POST /api/push/register` and `DELETE /api/push/register`.

---

## 11. WebRTC Signaling (Audio & Video Calling)

The backend acts as a **signaling relay only** — it does not touch media. All audio/video travels peer-to-peer via WebRTC (or through a TURN relay).

### Signaling Events

| Event | Direction | Payload |
|---|---|---|
| `call:initiate` | Caller → Server → Callee | `{ callId, callType, callerId }` |
| `call:ringing` | Server → Callee | `{ callId, caller }` |
| `call:accept` | Callee → Server → Caller | `{ callId }` |
| `call:reject` | Callee → Server → Caller | `{ callId, reason }` |
| `call:sdp-offer` | Caller → Server → Callee | `{ callId, sdp }` |
| `call:sdp-answer` | Callee → Server → Caller | `{ callId, sdp }` |
| `call:ice-candidate` | Either → Server → Other | `{ callId, candidate }` |
| `call:end` | Either → Server → Other | `{ callId }` |

### STUN/TURN Configuration

Load ICE server URLs and TURN credentials from environment variables — **never hard-code them**:

```typescript
// modules/calling/turn.service.ts
export function getIceServers(): RTCIceServer[] {
  return [
    { urls: process.env.STUN_URL ?? 'stun:stun.l.google.com:19302' },
    {
      urls: process.env.TURN_URL!,
      username: process.env.TURN_USERNAME!,
      credential: process.env.TURN_CREDENTIAL!,
    },
  ];
}
```

Expose TURN credentials to the client via `GET /api/calls/ice-servers` (authenticated, short-lived tokens preferred — use a TURN REST API if your TURN server supports it).

### Offline Call Delivery

If the callee has no active WebSocket when `call:initiate` arrives, immediately dispatch a push notification via the Push Notification Dispatcher so the callee's device wakes up and can accept.

### Group Calling

Do not implement mesh P2P for group calls. Use an SFU:

- **LiveKit** — managed or self-hosted; Node.js SDK available
- **mediasoup** — self-hosted; full control
- **Jitsi / Janus** — open-source alternatives

Recommended progression: 1-to-1 audio → 1-to-1 video → small group POC → SFU integration.

---

## 12. Database Schema (Prisma)

```prisma
// prisma/schema.prisma (key tables)

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  displayName   String
  role          String   @default("user")
  createdAt     DateTime @default(now())
  refreshTokens RefreshToken[]
  pushTokens    PushToken[]
  trackingSessions TrackingSession[]
}

model Message {
  id             String   @id @default(uuid())
  conversationId String
  senderId       String
  content        String
  eventId        String   @unique   // for deduplication
  status         String   @default("sent") // sent | delivered | read
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

model TrackingSession {
  id              String   @id @default(uuid())
  userId          String
  consentAt       DateTime // Consent timestamp — required for GDPR
  startedAt       DateTime @default(now())
  endedAt         DateTime?
  locations       TrackingLocation[]
  user            User @relation(fields: [userId], references: [id])
}

model TrackingLocation {
  id         String   @id @default(uuid())
  sessionId  String
  lat        Float
  lng        Float
  recordedAt DateTime @default(now())
  session    TrackingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, recordedAt])
}

model PushToken {
  id           String   @id @default(uuid())
  userId       String
  platform     String   // 'fcm' | 'apns' | 'web'
  token        String   @unique
  subscription Json?    // Web Push subscription object
  createdAt    DateTime @default(now())
  user         User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Call {
  id          String   @id @default(uuid())
  type        String   // 'audio' | 'video' | 'group'
  status      String   // 'ringing' | 'active' | 'ended' | 'missed'
  initiatorId String
  startedAt   DateTime?
  endedAt     DateTime?
  createdAt   DateTime @default(now())
  participants CallParticipant[]
}
```

Run migrations with:

```bash
npx prisma migrate dev --name <migration-name>   # development
npx prisma migrate deploy                        # production CI/CD
```

---

## 13. REST API & OpenAPI Documentation

All endpoints are documented in `docs/openapi.yaml` (OpenAPI 3.1). Swagger UI is available at `GET /api/docs` in non-production environments.

```typescript
// app.ts (excerpt)
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

if (process.env.NODE_ENV !== 'production') {
  const spec = YAML.load('./docs/openapi.yaml');
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
```

Maintain the spec alongside code — update `openapi.yaml` whenever an endpoint changes. Consider auto-generating TypeScript client types using `openapi-typescript`.

---

## 14. Observability

### Prometheus Metrics (prom-client)

```typescript
// metrics/prometheus.ts
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();

export const wsConnectionsActive = new Gauge({
  name: 'ws_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [registry],
});

export const wsEventLatency = new Histogram({
  name: 'ws_event_latency_ms',
  help: 'WebSocket event processing latency',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  labelNames: ['event_type'],
  registers: [registry],
});

export const pushDispatchDuration = new Histogram({
  name: 'push_dispatch_duration_ms',
  help: 'Time to dispatch an offline push notification',
  buckets: [100, 500, 1000, 3000, 10000],
  registers: [registry],
});
```

Expose at `GET /metrics` (internal only — block with Nginx from external traffic):

```typescript
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

### Structured Logging (Pino)

```typescript
// utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'realtime-platform' },
});

// Usage
logger.info({ userId, eventType: 'message:send', durationMs }, 'Event processed');
```

Log every WebSocket event with `userId`, `eventType`, `socketId`, and `durationMs`. Never log passwords, tokens, or raw location payloads.

### Grafana Dashboards

Set up dashboards for:
- Active WebSocket connections per instance
- Event throughput by type
- Event latency p50 / p95 / p99
- Redis Pub/Sub lag
- Push dispatch success/failure rate
- Call signaling completion rate

Configure alerts for: connections dropping > 20% in 5 min, event latency p99 > 500 ms, Redis unavailable.

---

## 15. Security

| Concern | Implementation |
|---|---|
| Authentication | JWT (short-lived, 15 min access token + HttpOnly refresh token) |
| WebSocket auth | Validate JWT on HTTP upgrade; reject before accepting any events |
| Payload validation | Zod schema on every inbound WS event and REST body |
| Rate limiting | `express-rate-limit` (REST) + per-user Redis counter (WS) |
| Origin validation | Check `Origin` header on WS upgrade; reject unknown origins |
| Size limits | Reject WS payloads > 64 KB; REST bodies limited by `express.json({ limit: '1mb' })` |
| HTTPS/WSS | Terminate TLS at Nginx; all internal traffic on the Docker network |
| Secrets | All credentials in `.env`; never committed to source control |
| TURN credentials | Loaded from env; exposed to clients only via authenticated API endpoint |
| Location data | Consent required; retention enforced; access restricted (see §16) |
| Push tokens | Scoped to user; deleted on account deletion |

---

## 16. Privacy & Compliance (Location Tracking)

```typescript
// Scheduled job — runs nightly
async function purgeOldLocationData(): Promise<void> {
  const retentionDays = parseInt(process.env.LOCATION_RETENTION_DAYS ?? '30');
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

  await prisma.trackingLocation.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });
  logger.info({ cutoff }, 'Location retention sweep complete');
}
```

- Consent timestamp stored in `tracking_sessions.consentAt`.
- `DELETE /api/tracking/sessions/:id/locations` purges all location rows for a session on request.
- Cascade `onDelete` in Prisma ensures location rows are deleted when a session or user is deleted.
- Log all access to location data at `info` level with `userId`, `purpose`, and `timestamp`.

---

## 17. File & Attachment Storage

```typescript
// services/storage.service.ts (AWS SDK v3)
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function getUploadUrl(key: string, mimeType: string): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: mimeType,
  }), { expiresIn: 300 }); // 5 min
}

export async function getDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  }), { expiresIn: 3600 }); // 1 hr
}
```

Metadata for each attachment is stored in the `attachments` table. The client uploads directly to S3 using a pre-signed PUT URL — the backend never proxies large files.

---

## 18. Testing Strategy

### Unit Tests (Vitest)

Test connection manager, room manager, event router, services, and utility functions in isolation with mocked dependencies.

### Integration Tests (Supertest + Vitest)

Spin up the Express app against a test database (use `prisma migrate reset` in CI). Test auth flows, chat persistence, and push dispatch logic.

### WebSocket Integration Tests

Use the `ws` package in test code to connect as a client:

```typescript
test('user receives message in real time', async () => {
  const client = new WebSocket(`ws://localhost:3000/ws?token=${testToken}`);
  await waitForOpen(client);

  client.send(JSON.stringify({ type: 'message:send', eventId: uuid(), payload: { ... } }));
  const received = await waitForEvent(client, 'message:new');
  expect(received.payload.content).toBe('Hello');
  client.close();
});
```

### k6 Load Test

```javascript
// tests/load/ws-load.js
import ws from 'k6/ws';
import { check } from 'k6';

export const options = { vus: 500, duration: '60s' };

export default function () {
  const res = ws.connect('wss://api.example.com/ws?token=<load-test-token>', {}, (socket) => {
    socket.on('open', () => socket.send(JSON.stringify({ type: 'ping' })));
    socket.on('message', (data) => check(JSON.parse(data), { 'has type': (e) => !!e.type }));
    socket.setTimeout(() => socket.close(), 50000);
  });
  check(res, { 'status was 101': (r) => r && r.status === 101 });
}
```

Target: 10,000 concurrent connections, p99 event latency < 200 ms.

---

## 19. Environment Variables

```env
# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/realtime_db

# Redis
REDIS_URL=redis://redis-sentinel:26379
REDIS_SENTINEL_NAME=mymaster

# JWT
JWT_SECRET=<256-bit-secret>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Push Notifications
FCM_PROJECT_ID=<firebase-project-id>
FCM_PRIVATE_KEY=<firebase-service-account-key>
VAPID_PUBLIC_KEY=<web-push-public-key>
VAPID_PRIVATE_KEY=<web-push-private-key>
VAPID_EMAIL=mailto:ops@example.com

# STUN/TURN
STUN_URL=stun:stun.l.google.com:19302
TURN_URL=turn:turn.example.com:3478
TURN_USERNAME=<turn-user>
TURN_CREDENTIAL=<turn-password>

# S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=realtime-platform-assets

# Privacy
LOCATION_RETENTION_DAYS=30

# Metrics
METRICS_PATH=/metrics
```

---

## 20. Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.9'
services:
  app:
    build: .
    ports: ['3000:3000']
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/realtime_dev
      - REDIS_URL=redis://redis:6379
    depends_on: [postgres, redis]
    volumes: ['./src:/app/src']

  postgres:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: realtime_dev }
    ports: ['5432:5432']
    volumes: ['postgres_data:/var/lib/postgresql/data']

  redis:
    image: redis:7
    ports: ['6379:6379']

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ['9000:9000', '9001:9001']
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }

volumes:
  postgres_data:
```

---

## 21. Key Dependencies

```json
{
  "dependencies": {
    "express": "^4",
    "ws": "^8",
    "typescript": "^5",
    "@prisma/client": "^5",
    "ioredis": "^5",
    "bullmq": "^5",
    "jsonwebtoken": "^9",
    "bcrypt": "^5",
    "zod": "^3",
    "pino": "^8",
    "prom-client": "^15",
    "swagger-ui-express": "^5",
    "firebase-admin": "^12",
    "web-push": "^3",
    "@aws-sdk/client-s3": "^3",
    "@aws-sdk/s3-request-presigner": "^3",
    "express-rate-limit": "^7"
  },
  "devDependencies": {
    "prisma": "^5",
    "vitest": "^1",
    "supertest": "^6",
    "@types/express": "^4",
    "@types/ws": "^8",
    "@types/jsonwebtoken": "^9"
  }
}
```
