---
name: realtime-backend
description: Conventions and workflow for this Real-Time Communication Platform backend (Node.js + Express + WebSocket + Prisma + Redis). Use whenever adding or modifying REST endpoints, WebSocket events, feature modules, database models, or background jobs in this repo.
---

# Real-Time Platform Backend

This skill captures how this backend is built so new work stays consistent with
the existing codebase. Full design rationale lives in [backend.md](../../../backend.md)
and [projectoverview.md](../../../projectoverview.md) — read those for the "why";
this file is the "how" for day-to-day changes.

**Scope note:** this repo is the backend only. There is no frontend here — do not
scaffold frontend code into this directory even though `projectoverview.md`
describes a paired frontend elsewhere.

## Stack

Express (REST) + `ws` (WebSocket) on one HTTP server · TypeScript strict mode ·
PostgreSQL via Prisma · Redis (`ioredis`) for pub/sub, presence, and rate limits ·
BullMQ for offline push dispatch · Zod for all validation · Pino for logging ·
prom-client for `/metrics` · Vitest + Supertest for tests.

## Project layout

```
src/
  config/        env.ts (Zod-parsed env), database.ts (Prisma singleton), redis.ts (3 ioredis clients)
  app.ts         Express app factory (middleware, routes, /health, /metrics, /api/docs)
  server.ts      HTTP server bootstrap, WS attach, workers, graceful shutdown
  middleware/    auth, validate, rate-limit, metrics, error
  websocket/     connection.manager, room.manager, event.router, event.types, heartbeat, websocket.server
  redis/         pub-sub.ts, presence.ts, rate-limit.ts
  modules/       one folder per feature: auth, chat, notifications, dashboard, tracking, calling, collaboration, push
                 each module owns its *.service.ts (Prisma queries), *.schemas.ts (Zod),
                 *.handler.ts (WS event definitions), and *.controller.ts + *.routes.ts (REST)
  services/      cross-cutting services: auth.service, push-dispatcher.service, push-senders.service, storage.service
  repositories/  shared DB access used outside a single module (e.g. push-token.repository.ts)
  queue/         push.queue.ts (BullMQ queue + worker)
  jobs/          location-retention.job.ts (scheduled interval jobs)
  metrics/       prometheus.ts (registry + custom metrics)
  database/prisma/schema.prisma
  types/         ws.ts (WsEvent envelope), express.d.ts (Request.user augmentation)
tests/
  unit/          no external services required — this is what `npm test` runs
  integration/   needs a real Postgres + Redis + .env — run with `npm run test:integration`
  load/          k6 script
docs/openapi.yaml
```

## Adding a new WebSocket event

1. Add the payload's Zod schema and an `EventDefinition<T>` (from
   `src/websocket/event.types.ts`) in the owning module's `*.handler.ts`.
2. Export it from that module's `Record<string, EventDefinition<any>>` map
   (e.g. `chatHandlers`).
3. Spread that map into `handlers` in `src/websocket/event.router.ts`.
4. To broadcast to everyone in a room, use `roomManager.broadcastToRoom(room, buildEvent(...))`
   — it publishes to Redis only (see the comment in `room.manager.ts`); the
   pub/sub subscriber relays back to local room members on every instance,
   including the one that published. **Never** also send directly to local
   sockets in the same call or messages will double-deliver.
5. To send to one specific user regardless of room (e.g. call signaling),
   look up `connectionManager.getByUser(userId)` and send directly — no Redis
   round trip needed for a single-instance target, but note this **does not**
   fan out across other server instances. Call signaling deliberately accepts
   this since callers/callees are expected to reconnect to any instance behind
   the sticky-session load balancer.
6. Every inbound payload is validated against its Zod schema in
   `event.router.ts` before the handler runs — do not re-validate inside handlers.
7. Errors thrown from a handler become a `sendError(conn, err.message, ...)`
   envelope — throw `Error` with a short UPPER_SNAKE code as the message
   (e.g. `throw new Error('FORBIDDEN')`) rather than building error envelopes
   by hand.

## Adding a new REST endpoint

Follow the existing module shape: `*.schemas.ts` (Zod) → `*.controller.ts`
(thin, calls the service) → `*.routes.ts` (wires `requireAuth` +
`validateBody` + controller) → mount in `src/routes/index.ts`. Controllers are
`async` and let thrown errors propagate — `express-async-errors` (imported
once in `app.ts`) forwards them to `errorHandler`. Throw
`Object.assign(new Error('MESSAGE'), { status: 403 })` for a specific HTTP
status; anything else becomes a 500.

## Adding a new Prisma model

Edit `src/database/prisma/schema.prisma`, then run `npm run prisma:migrate`
(dev) or `npm run prisma:deploy` (CI/production) — never hand-write SQL
migrations. Regenerate the client with `npm run prisma:generate` after
pulling schema changes from elsewhere.

## Auth: cookie-based refresh tokens

`POST /api/auth/register` and `/login` set the refresh token as an
`HttpOnly`, `SameSite=Lax` cookie scoped to `/api/auth` (see
`auth.controller.ts`) and return only `{ user, accessToken }` in the body —
the refresh token is never exposed to JS. `/api/auth/refresh` and
`/api/auth/logout` read that cookie instead of a request body. This exists to
match the frontend's stated security model (`relay-frontend` skill: "keep
access tokens in memory, use an HttpOnly refresh cookie"). `ALLOWED_ORIGINS`
(env, comma-separated) drives both `cors({ credentials: true })` in `app.ts`
and the WebSocket upgrade's Origin check in `websocket.server.ts` — keep it
in sync with wherever the frontend is actually served from, or cookies and
the WS handshake will silently fail cross-origin.

## Conventions worth preserving

- **At-least-once delivery for chat**: persist to Postgres *before*
  broadcasting (see `chat.handler.ts`'s `send`); clients ack via
  `message:ack` and catch up via `GET /api/conversations/:id/messages?after=`.
- **Location privacy**: always round coordinates via `roundCoordinate()` in
  `tracking.service.ts` before persisting. Read/join access to a tracking
  room is gated by `assertCanView` (owner OR a row in `TrackingSessionViewer`
  — see `addViewer`/`removeViewer`), not `assertOwner`; `assertOwner` is
  reserved for owner-only actions (stop, delete-locations, share/unshare).
  Sharing with a new viewer fires a persisted notification via
  `dispatchNotification` with `data.kind: 'tracking:shared'` — the frontend's
  tracking page listens for that exact marker to know when to refetch and
  auto-join a newly shared session; keep the string in sync if you touch
  either side. The retention job (`jobs/location-retention.job.ts`) purges
  rows older than `LOCATION_RETENTION_DAYS` — don't bypass it with raw deletes.
- **Push fallback**: use `dispatchNotification(userId, { type, title, body, data? })`
  from `services/push-dispatcher.service.ts` instead of checking
  `connectionManager.isUserOnline` yourself — it persists the notification
  (so it shows up in `GET /api/notifications` history) and then delivers over
  WS if online, else queues offline push. Don't call `notificationService.createNotification`
  directly for anything the recipient should be alerted to live — that skips delivery entirely.
- **WS payload/message size cap**: 64KB, enforced in `event.router.ts`. REST
  bodies are capped at 1MB in `app.ts`. Don't raise either without updating
  both this file and `backend.md` §15.
- **Never log secrets**: `logger` in `utils/logger.ts` redacts
  `authorization`/`password`/`token`/`refreshToken` — extend the redact list
  rather than logging sensitive fields manually.
- **Env vars are Zod-validated** in `config/env.ts` and the process throws on
  boot if one is missing/invalid — add new vars there (with a sensible
  default when optional) rather than reading `process.env` directly
  elsewhere.

## Commands

| Task | Command |
|---|---|
| Dev server (watch) | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |
| Unit tests (no infra needed) | `npm test` |
| Integration tests (needs Postgres+Redis+.env) | `npm run test:integration` |
| Lint | `npm run lint` |
| Prisma migrate (dev) | `npm run prisma:migrate` |
| Prisma migrate (deploy) | `npm run prisma:deploy` |
| Local infra (Postgres/Redis/MinIO/app) | `docker compose up` |

Before running integration tests or `dev` locally, copy `.env.example` to
`.env` and point `DATABASE_URL`/`REDIS_URL` at real instances (or
`docker compose up postgres redis`). On this machine specifically, Postgres's
host-side port is remapped to **15432** (not 5432) in `docker-compose.yml`/`.env`
— 5432 falls inside a Windows-reserved dynamic port range (Hyper-V/WSL2) and
fails to bind; container-to-container traffic still uses 5432 internally, so
only the host mapping and `DATABASE_URL`'s port needed to change.

## WebSocket envelope (all events, both directions)

```json
{ "type": "message:new", "eventId": "uuid", "timestamp": "ISO-8601", "payload": {}, "error": { "code": "", "message": "" } }
```

`error` is only present on rejected/failed events. Full event catalogue is in
`backend.md` §3 and §11 (calling) and `projectoverview.md` §7 (per-feature
event lists).
