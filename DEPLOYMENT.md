# Backend Deployment Guide

Operational reference for deploying and operating this backend in production.
For architecture/design rationale see `projectoverview.md` and `backend.md`; for
day-to-day coding conventions see `.claude/skills/realtime-backend/SKILL.md`.
This document covers the backend only — the frontend deploys separately (Vercel).

Current production target: **Railway**, project `websoket-backend`
(`https://backend-production-d47d.up.railway.app`).

---

## 1. Stack & build

| Concern | How it works here |
|---|---|
| Build | `Dockerfile` (multi-stage: deps → build → runtime), `node:20-slim` |
| Start command | `npx prisma migrate deploy && node dist/server.js` (baked into the image `CMD`) |
| Healthcheck | Railway checks `GET /health`, 100s timeout, restarts on failure (max 3 retries) — see `railway.toml` |
| Migrations | Applied **automatically on every boot** via `prisma migrate deploy` — no manual migration step needed as long as the migration files under `src/database/prisma/migrations/` are committed |

Because migrations run on every container start, **a bad migration blocks the
whole deploy** (the process won't reach `node dist/server.js` if `migrate
deploy` fails) — the healthcheck will fail and Railway will roll back/retry.
Always test a new migration against a copy of prod data or at minimum the
local Docker Postgres before pushing.

---

## 2. Prerequisites

- Railway CLI: `npm install -g @railway/cli`, then `railway login`
- Linked project: run `railway status` from the repo root — it should show
  project `websoket-backend`, environment `production`, linked service `backend`
- Node 20.x locally (matches the Docker base image) if building/testing outside Docker

---

## 3. Services in this Railway project

| Service | Purpose | Notes |
|---|---|---|
| `backend` | This Express + WS app | Public domain, healthchecked |
| `Postgres` | Primary datastore | Railway-managed, `postgres-volume` |
| `Redis` | Pub/sub, presence, rate limits, push queue | Railway-managed, `redis-volume` |
| `Bucket` | MinIO S3-compatible object storage (avatars, chat attachments) | Railway template `SMKOEA`, `bucket-volume`, public domain used directly as `S3_ENDPOINT` since presigned URLs must be browser-reachable |
| `Console` | MinIO web UI for `Bucket` | Login with `Bucket`'s `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |

`Postgres` and `Redis` are reached over Railway's private network
(`*.railway.internal`) — only `Bucket` needs a **public** endpoint, because
presigned upload/download URLs are handed directly to the browser, not
proxied through the backend.

---

## 4. Environment variables

Every var is validated by `src/config/env.ts` at boot — an invalid/missing
required var crashes the process immediately with a clear error, so a broken
config never serves traffic (fails the healthcheck → Railway retries/rolls back).

### Required (no default, boot fails without them)

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@postgres.railway.internal:5432/railway` | Railway auto-injects this if `Postgres` is a linked service reference |
| `JWT_SECRET` | random 32+ byte string | Rotating this invalidates every existing session/refresh token |

### Effectively required for the app to be useful in prod

| Var | Currently set? | Effect if missing |
|---|---|---|
| `ALLOWED_ORIGINS` | ✅ `https://websoket-frontned.vercel.app` | Wrong/missing value → CORS **and** the WS upgrade's Origin check both silently reject the real frontend. Must be kept in sync whenever the frontend's deployed domain changes. |
| `REDIS_URL` | ✅ | Falls back to `redis://localhost:6379` (wrong in any container env) — cross-instance events, presence, and push queueing break |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_ENDPOINT` | ✅ (wired to `Bucket`, see §5) | `storageService.isStorageConfigured()` returns false → avatar/attachment upload endpoints return a clean `503 STORAGE_NOT_CONFIGURED` instead of crashing |
| `SUPER_ADMIN_EMAIL` | ⚠️ **not currently set** | No account can ever become `super_admin` automatically — the bootstrap in `bootstrap.service.ts` / `auth.controller.ts::register` is a no-op without it. Set this to the email of the account that should be promoted, then either restart the service (if that account already exists) or have that email register. |

### Optional — feature-gated, safe to leave unset

| Var | Currently set? | Feature disabled while unset |
|---|---|---|
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` | ❌ | Android push notifications |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | ❌ | Web push notifications |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | ❌ | Calls fall back to the public Google STUN server only — calls between peers behind symmetric NAT/strict firewalls will fail to connect. `STUN_URL` defaults to `stun:stun.l.google.com:19302`. |
| `LIVESTREAM_MAX_VIEWERS` | ❌ (defaults to `8`) | Caps the live-stream mesh audience size |
| `LOCATION_RETENTION_DAYS` | ❌ (defaults to `30`) | Location history retention window |
| `AWS_REGION` | ✅ `us-east-1` | Ignored by MinIO but required by the AWS SDK client — any value works against MinIO/R2 |

Set/update a var:
```bash
railway variables --service backend --set "KEY=value"
```
Setting a variable **triggers an automatic redeploy** of that service.

---

## 5. Object storage (MinIO on Railway)

Provisioned via Railway's `MinIO` template (`SMKOEA`) rather than a third-party
account, to avoid an external signup dependency:

```bash
railway deploy -t SMKOEA
```

This creates two services (`Bucket` — the S3 API + volume, `Console` — the web
UI) and generates `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` on `Bucket`. Wire
those into `backend` as the AWS-style credentials:

```bash
railway variables --service backend \
  --set "AWS_ACCESS_KEY_ID=<Bucket's MINIO_ROOT_USER>" \
  --set "AWS_SECRET_ACCESS_KEY=<Bucket's MINIO_ROOT_PASSWORD>" \
  --set "S3_ENDPOINT=https://<Bucket's public domain>" \
  --set "S3_BUCKET=realtime-platform-assets" \
  --set "AWS_REGION=us-east-1"
```

Use `Bucket`'s **public** Railway domain (not `*.railway.internal`) for
`S3_ENDPOINT` — presigned GET/PUT URLs are handed to the browser directly, so
they must resolve outside Railway's private network. The bucket itself
doesn't need to be created manually: `ensureBucketExists()` runs once at
backend boot and creates it if missing (confirmed via `railway logs`: `"Created
storage bucket"`).

If you'd rather use real AWS S3 or Cloudflare R2 instead of self-hosted MinIO,
only the same five variables change — see `storage.service.ts`, which treats
any S3-compatible endpoint identically (`forcePathStyle: true` is applied
whenever `S3_ENDPOINT` is set).

---

## 6. Deploying

**Normal path — push to `main`.** Railway *should* auto-deploy on push if the
service's GitHub integration is connected and pointed at the right branch.
**Verify this is actually happening** (see the incident in §8) — check that
`railway deployment list --service backend`'s most recent entry's timestamp is
close to your last `git push`, not hours/days older.

**Manual deploy** (bypasses git entirely, ships whatever is in your local working
tree — useful if auto-deploy is broken or you need to hotfix immediately):
```bash
railway up --detach
```

**Check deploy status:**
```bash
railway deployment list --service backend   # recent deploys + status + timestamp
railway logs --service backend               # build + runtime logs, live-tailed without --deployment
```

A deploy is a black box until it reaches a terminal state — poll
`deployment list` for the new deployment ID rather than assuming success from
`railway up` returning.

---

## 7. Post-deploy verification checklist

1. `curl https://backend-production-d47d.up.railway.app/health` → `{"status":"ok",...}`
2. `railway logs --service backend | grep -i error` — nothing unexpected since boot
3. Hit an authenticated route with no token → expect `401 Missing bearer token`,
   **not** `404 Resource not found` (a 404 on a route you know exists in the
   code is the signature of a stale deploy — see §8)
4. If this deploy touched storage-dependent endpoints: confirm
   `storageService.isStorageConfigured()` is true — either check `railway
   variables --service backend` for the five S3 vars, or just attempt an
   upload and confirm it's not a `503 STORAGE_NOT_CONFIGURED`
5. If this deploy touched the Prisma schema: `railway logs` should show the
   migration applying cleanly at boot (no `migrate deploy` error before the
   `Server listening` log line)

---

## 8. Troubleshooting — real incidents

**`404 Resource not found` on a route that exists in the code.**
This is `notFoundHandler`'s own JSON body — it means the request reached the
Express app but matched no route, which almost always means **production is
running an older build that predates the route**, not a routing bug. Confirm
with:
```bash
railway deployment list --service backend   # when did the last deploy actually happen?
git log --format="%h %ad %s" --date=iso -5    # vs. when was the relevant commit made?
```
If the last deploy predates the commit, auto-deploy isn't firing — check the
service's GitHub connection/branch in the Railway dashboard, and in the
meantime unblock yourself with `railway up --detach`.

**`503 STORAGE_NOT_CONFIGURED` on an upload endpoint.**
Expected, not a bug — `storageService.isStorageConfigured()` deliberately
refuses cleanly instead of crashing when the five S3 vars aren't all set. Fix
per §5.

**Backend crashes shortly after boot with an unhandled rejection.**
Any `void someAsyncCall();` at module scope in `server.ts` with no `.catch()`
will crash the whole process on Node 20 if that call rejects (e.g. the DB
briefly unreachable at boot). Every fire-and-forget boot-time call in
`server.ts` (`ensureBucketExists`, `ensureSuperAdminBootstrap`, etc.) must have
a `.catch(err => logger.error(...))` — this already bit `ensureSuperAdminBootstrap`
once; check new ones added the same way.

**Prisma migration needed but you're scripting a non-interactive environment.**
`prisma migrate dev` refuses to run non-interactively (it wants a y/n prompt
for warnings). To generate a migration file without a live prompt:
```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel src/database/prisma/schema.prisma \
  --script > src/database/prisma/migrations/<timestamp>_<name>/migration.sql
```
Then commit it normally — `prisma migrate deploy` (already wired into the
start command, §1) applies it on the next boot. Sanity-check the generated SQL
before committing, especially any `ADD COLUMN ... NOT NULL` against a table
that already has rows.

---

## 9. Rollback

Railway doesn't have a one-command "redeploy previous commit." Fastest safe
path:
```bash
git revert <bad-commit>   # or git checkout <last-good-commit> -- .
git push
railway up --detach       # if auto-deploy isn't reliable, per §8
```
`railway down` removes the *most recent* deployment outright — only use it if
you're certain the previous deployment is still valid to fall back to, and
prefer a revert commit over this when the bad change touched a migration
(rolling back the app without rolling back a schema change it depended on can
leave the DB and code out of sync).

---

## 10. CLI cheat-sheet

```bash
railway status                                    # linked project/service, all services' online status
railway variables --service backend               # list current env vars
railway variables --service backend --set "K=V"   # set one (auto-redeploys)
railway deployment list --service backend         # recent deploys, status, timestamp
railway logs --service backend                    # tail logs
railway up --detach                                # manual deploy of local working tree
railway deploy -t <template-code>                  # provision a Railway template as a new service
```
