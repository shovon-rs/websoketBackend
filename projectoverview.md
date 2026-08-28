# Real-Time Communication Platform
### Project Plan & Technical Architecture

**Backend:** Node.js + Express.js + WebSocket + TypeScript  
**Frontend:** React.js / Next.js  
**Scope:** Chat · Real-Time Notifications · Live Dashboards · Collaborative Applications · Live Tracking · Audio & Video Calling

---

## 1. Project Vision

Build a reusable real-time platform instead of six independent applications. Express.js handles normal HTTP/REST operations while WebSocket handles persistent, low-latency, bidirectional events. PostgreSQL stores durable data; Redis supports presence, Pub/Sub, and horizontal scaling; WebRTC powers peer-to-peer audio and video media.

---

## 2. Objectives

- Authenticated persistent WebSocket connections
- Reusable users, rooms/channels, presence, broadcasting, and event-routing infrastructure
- Feature modules for chat, notifications, dashboards, collaboration, tracking, and audio/video calling
- Secure REST and WebSocket APIs with validation and authorization
- Offline/push notification fallback via FCM/APNs for closed/backgrounded clients
- Production-ready logging, monitoring (Prometheus + Grafana), testing, Docker, and scalable deployment

---

## 3. Technology Stack

| Area | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Backend runtime |
| HTTP API | Express.js | REST APIs and middleware |
| Realtime | WebSocket (ws) | Persistent bidirectional communication |
| Language | TypeScript | Type safety and maintainability |
| Database | PostgreSQL | Durable application data |
| DB Migrations | Prisma / TypeORM | Schema migrations and type-safe queries |
| Cache/PubSub | Redis (Sentinel or Cluster) | Presence, ephemeral state, cross-server events (HA) |
| Auth | JWT + refresh tokens | Authentication and sessions |
| Validation | Zod | REST/WebSocket payload validation |
| API Docs | OpenAPI / Swagger | REST API documentation |
| Frontend | Next.js App Router / React.js | Client applications |
| Maps | Mapbox / Google Maps / OpenStreetMap | Live tracking |
| Media | WebRTC | Peer-to-peer audio/video |
| NAT Traversal | STUN / TURN | WebRTC connectivity through firewalls |
| Group Media | SFU (LiveKit / mediasoup) | Scalable group calling |
| Push Notifications | FCM (Android) + APNs (iOS) + Web Push | Offline/backgrounded client delivery |
| File Storage | S3-compatible (AWS S3 / MinIO) | Attachments, recordings (future) |
| Testing | Vitest/Jest + Supertest | Unit/API/integration testing |
| Load Testing | k6 | Concurrent WebSocket testing |
| Monitoring | Prometheus + Grafana | Metrics, connection counts, event latency |
| Deployment | Docker + Nginx | Containerization and reverse proxy |

---

## 4. High-Level Architecture

```
Client → HTTPS/WSS → Nginx/Load Balancer (sticky sessions)
       → Node.js + Express/WebSocket instances
       → Redis Sentinel/Cluster (Pub/Sub + presence)
       → PostgreSQL

WebRTC Media Path:
Browser ↔ STUN → direct peer-to-peer (if possible)
Browser ↔ TURN ↔ Browser (relay fallback)

Offline Push Path:
Server → FCM/APNs/Web Push → Device (when WebSocket is not open)
```

Express.js handles REST APIs. The WebSocket layer manages authentication, connections, rooms, heartbeat, and event routing. Redis distributes events across multiple WebSocket server instances. PostgreSQL is the source of truth for all persistent records.

---

## 5. Core Backend Modules

**Authentication & Authorization**  
Register/login/logout, JWT validation, refresh tokens, roles and permissions. Authenticate the WebSocket handshake before accepting application events.

**Connection Manager**  
Track user ID, socket ID, connection state, rooms, last heartbeat, and connection time. Handle connect, disconnect, reconnect, ping/pong, and cleanup.

**Room / Channel Manager**  
joinRoom, leaveRoom, broadcastToRoom, sendToUser, and broadcastToAll. Enforce authorization before joining protected rooms.

**Event Router**  
Validate the common event envelope and route events to feature handlers. Keep chat, notification, dashboard, collaboration, tracking, and calling handlers independent.

**Presence**  
Online/offline/away state, last seen, and optional typing indicators.

**Push Notification Dispatcher**  
Before sending a WebSocket event to a user, check whether they have an active connection. If not, fall back to FCM (Android), APNs (iOS), or Web Push (browser). A reliable queue (e.g., Bull/BullMQ backed by Redis) should buffer outbound push jobs so they survive a server restart.

---

## 6. Standard WebSocket Event Contract

Use one event format across the entire platform:

```json
{
  "type": "message:new",
  "eventId": "evt_abc123",
  "timestamp": "2026-08-26T10:00:00Z",
  "payload": { }
}
```

| Field | Description |
|---|---|
| `type` | Event name, e.g. `message:new`, `location:update` |
| `eventId` | Unique identifier for tracing and deduplication |
| `timestamp` | ISO-8601 event timestamp |
| `payload` | Feature-specific data |
| `error` | Standardized error object when an event is rejected |

### 6.1 Message Delivery Guarantees

The platform uses an **at-least-once** delivery model:

- The server persists a chat message to PostgreSQL **before** broadcasting it over WebSocket.
- Clients acknowledge receipt with a `message:ack` event carrying the `eventId`. If no ack arrives within a configurable timeout, the server may retry delivery.
- `eventId` is used for client-side deduplication so duplicate deliveries are idempotent.
- When a user reconnects, the client sends its last seen `eventId` per conversation; the server performs a REST catch-up (`GET /api/conversations/:id/messages?after=<eventId>`) to fill the gap for messages received while disconnected.
- Messages sent while a recipient is fully offline are stored in PostgreSQL and delivered on the next connection (or via push notification for important events).

---

## 7. Feature Modules

### 7.1 Chat Application

- One-to-one and group conversations
- Message send/receive and persistence
- Typing indicators and online/offline presence
- Delivered/read status and message history
- Future: attachments (S3), reactions, replies, and search

**Core events:** `chat:join`, `chat:leave`, `message:send`, `message:new`, `message:delivered`, `message:read`, `typing:start`, `typing:stop`

### 7.2 Real-Time Notifications

- User-specific and system/broadcast notifications
- Read/unread state and notification history
- Severity types: `info`, `success`, `warning`, `error`
- **Offline fallback:** if the target user has no active WebSocket connection, the notification is dispatched via FCM/APNs/Web Push through the Push Notification Dispatcher

**Core events:** `notification:new`, `notification:read`, `notification:read-all`

### 7.3 Live Dashboard

- Live KPI updates, activity streams, alerts, and connection statistics
- Real-time charts fed by server events

**Core events:** `dashboard:metrics`, `dashboard:activity`, `dashboard:alert`

### 7.4 Collaborative Application

- Shared document/workspace rooms
- Real-time edits, presence, cursor/selection sharing, and document history
- Start with simple operation broadcasting; later evaluate OT or CRDT for conflict resolution

**Core events:** `document:join`, `document:update`, `document:cursor`, `document:leave`

### 7.5 Live Tracking

- Tracking sessions and latitude/longitude updates
- Authorized tracking rooms, map visualization, and location history
- Configurable update frequency and rate limiting
- **Privacy & compliance:** see §17

**Core events:** `tracking:start`, `tracking:join`, `location:update`, `tracking:stop`

### 7.6 Audio & Video Calling

- One-to-one and group audio/video calls via WebRTC
- WebSocket used for signaling and call-state events
- Screen sharing via `getDisplayMedia()`
- Group calls via SFU (LiveKit / mediasoup) for scalability
- **Offline fallback:** incoming call notifications dispatched via FCM/APNs/Web Push when the callee has no open WebSocket

**Core events:** `call:initiate`, `call:ringing`, `call:accept`, `call:reject`, `call:end`, `call:ice-candidate`, `call:sdp-offer`, `call:sdp-answer`

### 7.7 Roles & Administration

- Ordered role hierarchy: `user` < `admin` < `super_admin`; each higher role inherits every privilege of the roles below it — not two independent permission sets.
- `admin`: view every registered user and change their role, limited to moving a user between `user` and `admin`. An `admin` may never grant, revoke, or otherwise act on `super_admin`.
- `super_admin`: everything `admin` can do, plus grant/revoke `super_admin` itself, create and cancel announcements, and approve or reject live-stream requests.
- Changing your own role is never permitted, at any role, to avoid accidental lockout.
- A role change takes effect on the affected user's next token refresh, not instantly — the access token carries the role as a claim (see §18.1 for why privileged endpoints re-check the database instead of trusting that claim).
- The first `super_admin` is bootstrapped from a configured admin email at startup (if the account already exists) or at registration (if it registers afterward) — no role can be granted before one exists.

### 7.8 Announcements & Live Streaming

- A `super_admin` composes an announcement — title, body, and an optional scheduled date/time — for either every user on the platform or a specific invited list.
- Announcements are always persisted before delivery, the same at-least-once principle chat already uses (§6.1): delivered live over WebSocket to connected users, queued as offline push otherwise, and always visible via REST history so nobody misses one.
- A scheduled announcement carries a live countdown to its start time; when that time arrives, a background sweep flips its status to "live" and fires a second "starting now" notification to the same audience.
- Any user may request to go live (title, description, proposed date/time). A `super_admin` reviews pending requests and either approves — turning the request into a scheduled live-stream announcement with a countdown — or rejects it. The requester is notified of the outcome either way, and pending requests notify the super admin(s) live so they don't have to poll for them.
- An approved live stream opens a real WebRTC video room: the broadcaster shares camera/mic directly to each viewer who joins — a small-scale mesh (one direct peer connection per viewer), reusing calling's signaling pattern rather than new WebRTC plumbing. This intentionally does not scale past a handful of concurrent viewers; true many-to-many streaming is the group-calling SFU integration already on the roadmap (§7.6, §11), not this feature.

**Core events:** `announcement:new`, `announcement:live`, `livestream-request:new`, `livestream-request:decided`, `live:join`, `live:viewer-joined`, `live:sdp-offer`, `live:sdp-answer`, `live:ice-candidate`, `live:end`

---

## 8. REST API Plan

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create user |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/users/me` | Current user profile |
| GET | `/api/conversations` | Conversation list |
| GET | `/api/conversations/:id/messages` | Message history (paginated, supports `?after=<eventId>` for catch-up) |
| GET | `/api/notifications` | Notification history |
| GET | `/api/dashboard/summary` | Initial dashboard snapshot |
| POST | `/api/tracking/sessions` | Create tracking session |
| GET | `/api/tracking/sessions/:id` | Tracking session details |
| POST | `/api/calls` | Initiate a call |
| GET | `/api/calls/:id` | Call details |
| POST | `/api/push/register` | Register FCM/APNs/Web Push token |
| DELETE | `/api/push/register` | Unregister push token |
| GET | `/api/users/admin` | Full user roster with roles (admin+) |
| PATCH | `/api/users/:id/role` | Change a user's role (admin+, subject to the escalation rules in §7.7) |
| POST | `/api/announcements` | Create and broadcast an announcement (super_admin) |
| GET | `/api/announcements` | List announcements visible to the caller |
| GET | `/api/announcements/upcoming` | Soonest upcoming/live announcement visible to the caller |
| PATCH | `/api/announcements/:id/cancel` | Cancel a scheduled or live announcement (super_admin) |
| POST | `/api/announcements/requests` | Submit a request to go live |
| GET | `/api/announcements/requests` | List live-stream requests (super_admin) |
| POST | `/api/announcements/requests/:id/approve` | Approve a request, scheduling the live stream (super_admin) |
| POST | `/api/announcements/requests/:id/reject` | Reject a request (super_admin) |

Full API specification is documented in OpenAPI/Swagger format (see `docs/openapi.yaml`).

---

## 9. Database Schema

### PostgreSQL Tables

| Table | Description |
|---|---|
| `users` | User accounts and profile |
| `refresh_tokens` | JWT refresh token store |
| `conversations` | One-to-one and group conversation metadata |
| `conversation_members` | Participants per conversation |
| `messages` | Persisted chat messages |
| `notifications` | User notification records |
| `documents` | Collaborative document metadata |
| `document_versions` | Document revision history |
| `tracking_sessions` | Live tracking session metadata |
| `tracking_locations` | Raw lat/lng history (see §17 for retention policy) |
| `calls` | Call ID, type, status, initiator, started/ended timestamps |
| `call_participants` | Per-call participant records |
| `call_events` | Optional audit trail of call state transitions |
| `call_quality_metrics` | Optional packet loss, latency, jitter (future) |
| `push_tokens` | FCM/APNs/Web Push device tokens per user |
| `attachments` | File attachment metadata (S3 key, MIME type, size) — future |
| `announcements` | Announcement/event records — kind, audience, schedule, status |
| `announcement_invites` | Per-user invite list for `invited`-audience announcements |
| `livestream_requests` | User requests to go live and their review outcome |
| `livestream_sessions` | Active/past live-stream video sessions |
| `livestream_viewers` | Best-effort audit trail of who joined a live session (see §18.4) |

PostgreSQL stores all durable records. Redis stores ephemeral connection/presence state and distributes events.

> **Migrations:** All schema changes are managed via Prisma Migrate (or TypeORM migrations). Never apply raw SQL to production without a migration file.

---

## 10. Redis Architecture

| Usage | Detail |
|---|---|
| Pub/Sub | Cross-server WebSocket event distribution |
| Presence keys | User online state with TTL |
| Room membership cache | Optional ephemeral cache |
| Rate-limit counters | Per-user/IP sliding window |
| Connection metadata | Short-lived socket context |
| Push job queue | BullMQ queue for offline push dispatch |

> **Never** use Redis as the primary store for durable chat or business records.

### 10.1 High Availability

Single-instance Redis is a single point of failure. For production:

- **Redis Sentinel** — automatic failover with a primary + replica setup. Suitable for most workloads.
- **Redis Cluster** — horizontal sharding across multiple primaries. Required at very high throughput.

If Redis is unavailable, real-time events degrade gracefully; REST APIs backed by PostgreSQL remain functional.

---

## 11. WebSocket Load Balancing & Sticky Sessions

WebSocket connections are stateful — a client stays pinned to one server instance for the life of the connection. When Nginx sits in front of multiple Node.js instances, ordinary round-robin will break real-time state.

**Required configuration:**

- **IP-hash affinity** (`ip_hash` in Nginx upstream) — routes each client IP to the same backend.
- **Cookie-based sticky sessions** — preferred when clients share an IP (e.g., NAT). Set a session cookie on the first HTTP upgrade and route subsequent requests by that cookie.
- Redis Pub/Sub distributes events across instances, but it cannot replace sticky sessions — a reconnect that lands on a different instance before the session is re-established will lose in-flight state.

```nginx
upstream realtime_backend {
    ip_hash;
    server node1:3000;
    server node2:3000;
    server node3:3000;
}
```

For cloud deployments (AWS ALB, GCP Load Balancer), enable "stickiness" / "session affinity" in the load balancer settings.

---

## 12. Security Requirements

- JWT authentication for REST and WebSocket handshake
- Role/permission checks for protected resources and rooms
- Zod validation for every incoming WebSocket payload
- Message and payload size limits
- HTTP and WebSocket rate limiting
- Origin validation
- HTTPS/WSS in production
- Never log passwords, tokens, or sensitive payloads
- STUN/TURN credentials stored in environment variables, not source code
- Privileged (admin/super_admin) actions re-check the caller's role against the database on every request rather than trusting the JWT claim alone, closing the window where a just-revoked role would otherwise stay valid for the remaining life of the access token (see §18.1)

---

## 13. Reliability

- Heartbeat/ping-pong to detect dead connections
- Client reconnection with exponential backoff
- Graceful server shutdown
- Connection cleanup on disconnect
- Event IDs for tracing and deduplication
- Timeouts for long-running operations
- At-least-once message delivery with client-side ack and catch-up (§6.1)
- Offline push notification fallback for critical events

---

## 14. Observability

WebSocket-heavy systems have different failure modes from standard HTTP services. Generic app logs are not sufficient — you need real-time metrics for connection health.

### Metrics (Prometheus + Grafana)

| Metric | Why It Matters |
|---|---|
| `ws_connections_active` | Total open WebSocket connections per instance |
| `ws_connections_total` (counter) | Connection churn rate |
| `ws_event_latency_ms` (histogram) | End-to-end event processing time |
| `ws_events_per_second` | Throughput per event type |
| `redis_pubsub_lag_ms` | Cross-instance event distribution delay |
| `call_signaling_duration_ms` | Time to complete WebRTC offer/answer exchange |
| `push_dispatch_duration_ms` | Offline push delivery latency |

Use Prometheus client (`prom-client`) in Node.js to expose a `/metrics` endpoint. Grafana dashboards visualize these in real time.

### Structured Logging

Use a structured logger (Pino / Winston) that emits JSON log lines with `level`, `timestamp`, `requestId`, `userId`, `eventType`, and `durationMs` fields. Ship logs to a log aggregation service (Loki, Datadog, or ELK).

### Alerting

Configure Grafana alerts for:
- `ws_connections_active` drops sharply (mass disconnect)
- `ws_event_latency_ms` p99 > 500 ms
- Redis Pub/Sub lag > 200 ms
- Error rate > 1%

---

## 15. File & Attachment Storage

Even though attachments and call recordings are listed as future features, define the storage interface now so the database schema does not need rework later.

| Concern | Decision |
|---|---|
| Storage backend | S3-compatible (AWS S3 or self-hosted MinIO) |
| Upload flow | Client requests a pre-signed PUT URL from the API; uploads directly to S3; sends the S3 key back to the server |
| Metadata | Stored in the `attachments` table (S3 key, bucket, MIME type, size, uploader, created_at) |
| Access control | Pre-signed GET URLs with short TTL; never expose the raw S3 bucket publicly |
| Max file size | Enforced at the API layer (e.g., 50 MB per file) |
| Recording storage | Call recordings (future) stored in a separate S3 prefix with retention policy |

---

## 16. API Documentation

All REST endpoints are described in OpenAPI 3.1 format in `docs/openapi.yaml`. Swagger UI is served at `/api/docs` in development mode (disabled in production by default, or behind basic auth).

Maintain the spec alongside the code — update `openapi.yaml` whenever an endpoint is added or changed. Consider generating TypeScript types from the spec using `openapi-typescript`.

---

## 17. Privacy & Compliance (Location Tracking)

`tracking_locations` stores raw latitude/longitude history. This data is subject to privacy regulations (GDPR, CCPA, and similar) wherever users are located.

| Requirement | Implementation |
|---|---|
| **Consent** | Users must explicitly start a tracking session; the `tracking_sessions` table records the user's consent timestamp |
| **Retention policy** | Raw location rows older than 30 days (configurable) are deleted by a scheduled job |
| **Data deletion** | `DELETE /api/tracking/sessions/:id/locations` purges all location history for a session; cascades on user account deletion |
| **Data minimization** | Store only the precision needed for the feature; round coordinates to 4–5 decimal places (~1–10 m) rather than storing full GPS precision |
| **Access control** | Only the session owner and explicitly authorized viewers may query location history |
| **Audit log** | Log all access to location data with user ID, timestamp, and purpose |

---

## 18. Roles, Admin & Live Streaming Design

Roles, announcements, and live streaming build directly on infrastructure already described above (§6.1 delivery guarantees, §7.6 calling/WebRTC, §10 Redis pub/sub) rather than introducing new infrastructure.

### 18.1 Role Hierarchy

| Rule | Detail |
|---|---|
| Hierarchy | `user` (0) < `admin` (1) < `super_admin` (2); higher ranks inherit all lower-rank privileges |
| Grant/revoke `super_admin` | Only an existing `super_admin` may do this |
| Grant/revoke `admin` | An `admin` or `super_admin` may move a user between `user` and `admin`; an `admin` may never act on an existing `super_admin` |
| Self-role-change | Never permitted, at any role, to avoid accidental lockout |
| Bootstrap | A configured super-admin email is promoted at startup (if the account already exists) or at registration (if it registers afterward) — the only way the first `super_admin` can come to exist |
| Staleness | Access tokens carry the role claim and are not re-verified for ordinary requests; privileged endpoints specifically re-check the database on every call so a revoked role can't keep acting for the remaining life of the token |

### 18.2 Announcement Delivery

| Audience | Delivery mechanism |
|---|---|
| `everyone` | Every connection auto-joins one platform-wide room at connect time — the sole exception to every other room in this platform being opt-in. Announcements publish to it via the existing Redis pub/sub fan-out (§10), reaching all connected users across every instance in one call. Notification rows are bulk-inserted for every user in one round trip, and offline users are enqueued for push in bulk, rather than looping per user. |
| `invited` | Delivered directly to each invited user's active connection(s), the same way call signaling already targets a specific user (§7.6) — no room needed for a short, explicit list. Still persisted per-recipient for REST catch-up and offline push. |

Both paths follow the same persist-before-deliver principle as chat (§6.1): a missed WebSocket delivery is never a lost announcement, only a delayed one, visible on next login via notification history.

### 18.3 Live-Stream Countdown

A scheduled announcement's target time is checked by a periodic background sweep (the same pattern as the location-retention job, §17). Because multiple server instances run this sweep independently with no leader election, the sweep claims a row with a conditional update — only flipping `scheduled → live` if the row is *still* `scheduled` at that instant — so exactly one instance's pass wins the race and exactly one "starting now" notification goes out. A blind, unconditional flip would double-notify under concurrent instances.

### 18.4 Live-Stream Video Scope

The approved broadcaster's camera/mic reaches each viewer via a direct WebRTC connection per viewer (a small mesh), reusing the same signaling pattern, STUN/TURN configuration, and offer/answer/ICE exchange as one-to-one calling (§7.6) rather than new WebRTC plumbing. This is a deliberate scope boundary, not an oversight: a mesh's bandwidth cost on the broadcaster grows with every viewer, so it is capped to a small, config-driven audience and is explicitly not the scalable path — true many-to-many streaming is the group-calling SFU integration already on the roadmap (§7.6, §11).

---

## 19. Development Roadmap

| Phase | Module | Main Work | Estimate |
|---|---|---|---|
| Phase 1 | Project Setup | Node.js, Express.js, TypeScript, PostgreSQL, Redis, Docker, linting, Prisma migrations, OpenAPI stub | ~1 week |
| Phase 2 | Authentication | JWT, refresh tokens, roles, permissions, WebSocket authentication | ~1 week |
| Phase 3 | WebSocket Core | Connection manager, heartbeat, room manager, event router, validation | ~1–2 weeks |
| Phase 4 | Chat | One-to-one/group chat, persistence, typing, presence, read/delivery, catch-up REST | ~2 weeks |
| Phase 5 | Notifications | User/system notifications, read/unread state, offline push via FCM/APNs | ~1 week |
| Phase 6 | Live Dashboard | Live metrics, activity feed, alerts | ~1 week |
| Phase 7 | Live Tracking | Tracking sessions, location events, map UI, location history, privacy controls | ~1–2 weeks |
| Phase 8 | Audio Calling | One-to-one WebRTC audio, signaling, call states, STUN/TURN | ~2 weeks |
| Phase 9 | Video Calling | One-to-one video, camera controls, screen sharing | ~1 week |
| Phase 10 | Collaboration | Shared documents, presence, edits, versioning | ~2 weeks |
| Phase 11 | Group Calling | SFU-based group audio/video (LiveKit/mediasoup) | ~2 weeks |
| Phase 12 | Scaling & Production | Redis Sentinel/Cluster, sticky sessions, Prometheus/Grafana, load tests, CI/CD | ~2 weeks |
| Phase 13 | Roles, Admin & Live Streaming | Role hierarchy and admin gating, admin user/role management, announcements with countdown (everyone/invited audience), live-stream request/approval workflow, small-scale mesh live video (see §18) | ~2–3 weeks |

**Total estimate:** ~18–22 weeks for a full team, plus ~2–3 weeks for Phase 13 as a post-MVP addition. MVP (Phases 1–6 + basic audio/video) is achievable in ~10–12 weeks.

---

## 20. Testing Strategy

- **Unit tests** — connection manager, room manager, event router, services (Vitest/Jest)
- **API integration tests** — authentication and CRUD endpoints (Supertest)
- **WebSocket integration tests** — connect, authenticate, join, broadcast, disconnect
- **Feature tests** — chat, notifications, dashboard, collaboration, tracking, calling
- **k6 load tests** — concurrent WebSocket clients and event throughput
- **Failure tests** — Redis/database outages, unexpected disconnects, push dispatch failures
- **Privacy tests** — verify location data deletion cascade and retention job

---

## 21. Deployment

**Development:** Docker Compose with Node.js, PostgreSQL, Redis, and MinIO.

**Production:**
```
Client → HTTPS/WSS
  → Nginx (sticky sessions: ip_hash or cookie affinity)
    → Node.js instances (3+)
      → Redis Sentinel/Cluster (Pub/Sub + presence + push queue)
        → PostgreSQL (primary + read replica)
          → S3-compatible storage
          → FCM / APNs (push notifications)
          → STUN/TURN servers (WebRTC NAT traversal)
```

---

## 22. MVP Scope

- JWT authentication and WebSocket authentication
- Connection manager, heartbeat, rooms, and presence
- One-to-one and group chat with PostgreSQL persistence
- At-least-once delivery with client-side catch-up on reconnect
- Real-time notifications with FCM/APNs offline fallback
- Basic live dashboard
- Basic live location tracking (with consent and retention policy)
- One-to-one audio calling via WebRTC
- One-to-one video calling via WebRTC
- Microphone/camera controls and basic screen sharing
- Dockerized development environment
- Prisma migrations, OpenAPI spec stub
- Prometheus metrics endpoint, structured logging, health checks
- Basic automated tests

Group calling via SFU, advanced collaborative editing, attachments, call recording, advanced analytics, multi-region scaling, and roles/admin/announcements/live streaming (§18) follow the MVP.

---

## 23. Success Criteria

- Users maintain stable authenticated WebSocket connections
- Users receive only events from authorized rooms
- Chat messages arrive in real time, are persisted, and survive reconnects via catch-up
- Notifications arrive instantly over WebSocket and via push when the client is offline
- Dashboard metrics update without polling
- Tracking positions update on the map in near real time, with consent recorded
- Two users can establish audio and video calls
- WebRTC offer/answer exchange completes through the signaling server
- Multiple backend instances exchange events through Redis Pub/Sub
- Prometheus metrics show connection count and event latency
- Platform passes concurrent WebSocket load tests under k6
- Production deployment uses HTTPS/WSS, sticky sessions, Redis HA, and secure STUN/TURN

---

## 24. Official References

| Resource | URL |
|---|---|
| Express.js | https://expressjs.com/ |
| React | https://react.dev/ |
| Next.js | https://nextjs.org/docs |
| ws (WebSocket) | https://github.com/websockets/ws |
| Prisma | https://www.prisma.io/docs |
| Redis | https://redis.io/docs |
| Prometheus Node client | https://github.com/siimon/prom-client |
| LiveKit (SFU) | https://docs.livekit.io |
| OpenAPI | https://swagger.io/specification/ |
| FCM | https://firebase.google.com/docs/cloud-messaging |
| Web Push | https://web.dev/push-notifications-overview/ |
