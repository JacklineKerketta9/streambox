# PRD: StreamBox, a Netflix-like Streaming Backend

**Author:** Jackline D Kerketta | **Version:** 2 (updated to match the build) | **Timeline:** ~4 weeks

## 1. Overview

StreamBox is a backend-first video streaming platform. Admins upload videos, the system transcodes them into adaptive-bitrate HLS streams, and authenticated users browse a catalog, watch, and resume where they left off. A lightweight React (Vite) frontend with an hls.js player demonstrates the system end to end; the focus remains the backend.

**Goal:** a simple, well-designed, measurable backend that demonstrates async pipelines, caching, write-heavy path design, rate limiting, and secure content delivery.

### Status at a glance

| Area | Status |
|---|---|
| Auth: email/password, Google OAuth, refresh rotation with reuse detection | Built |
| Catalog: titles, genres, home rows, search (`LIKE`), admin CRUD | Built |
| Upload + transcoding: presigned upload, BullMQ, FFmpeg HLS ladder, retries, status, Studio UI | Built |
| Playback with resume, My List, Continue Watching | Built |
| React frontend, Docker Compose (web, API, worker, MySQL, Redis, MinIO), CI | Built |
| Signed, expiring playback URLs | Built for transcoded HLS assets (5-minute signed API URLs; object bucket private) |
| Redis-buffered watch progress | Built (10-second worker flush, MySQL fallback while Redis is down) |
| Redis home-feed cache with stampede protection | Built (5-minute TTL + jitter, version invalidation, stale-while-rebuild) |
| Rate limiting | Built (atomic Redis token buckets; stricter auth bucket) |
| GitHub OAuth, TMDB import, FULLTEXT search, OpenAPI docs, metrics, k6 benchmarks | Not started |

## 2. Problem and Objectives

Video platforms hit hard backend problems that CRUD apps never touch: huge file handling, slow background processing, read-heavy feeds, and very frequent small writes (watch progress).

| # | Objective | Measure |
|---|---|---|
| O1 | Convert any uploaded video to HLS (360p/720p/1080p) automatically | ≥ 95% jobs succeed (with retries) |
| O2 | Serve the home feed fast | p95 < 100 ms with cache |
| O3 | Handle watch-progress heartbeats without a DB write each time | ≥ 90% fewer MySQL writes vs. direct writes |
| O4 | Protect content and APIs | Signed URLs expire; rate limits enforced |
| O5 | Be easy to run and review | One command: `docker compose up --build` (web, API, MySQL, Redis, MinIO) |

## 3. Users

- **Viewer:** signs up, browses, searches, watches, resumes, keeps a "My List".
- **Admin:** uploads videos, adds metadata, monitors processing status.

## 4. Scope

### In scope (MVP)

1. **Auth:** OAuth 2.0 sign-in (Google, optional GitHub) plus simple email/password signup, with JWT access + refresh tokens (rotation).
2. **Catalog:** titles with genres, search, paginated home rows (by genre, trending).
3. **Upload and transcoding:** presigned upload to object storage, queued FFmpeg job, status tracking, retries.
4. **Playback:** authorization check, short-lived signed manifest URL.
5. **Watch progress:** heartbeat endpoint, Redis buffering, batched flush to MySQL, "Continue Watching".
6. **My List:** add/remove titles.
7. **Platform:** Redis caching for home feed, Redis-based rate limiting, health checks, structured logs, basic metrics.

### Out of scope

Payments, DRM, live streaming, multi-profile accounts, recommendations ML, mobile apps, a heavily polished UI (the frontend is functional, not a design showcase), microservices (see Architecture).

### Stretch (only if time remains)

Trending via Redis sorted sets, Meilisearch, Prometheus + Grafana dashboard, chunked parallel transcoding.

## 5. Functional Requirements

### FR1: Auth
**Two ways to sign in, one session system.** Both methods end by issuing the same app-issued JWTs.

*Email + password (simple signup)*
- Signup with email + password (hashed with bcrypt), basic validation, unique email.
- Login verifies the password and issues tokens.

*OAuth 2.0 (Google, optional GitHub)*
- Authorization Code flow using Passport.js strategies: `GET /auth/google` redirects to the provider, and `GET /auth/google/callback` handles the response.
- A random `state` parameter is generated and verified on callback to prevent CSRF.
- On callback, the backend reads the provider ID, email, and name, then finds or creates the user:
  - Known provider identity → log in.
  - New identity with an email that matches an existing user → link only if the provider reports the email as verified.
  - Otherwise → create a new user with no password.
- The provider's tokens are not used as our session. The backend issues its own tokens (below).

*Sessions (both methods)*
- Access token: JWT, 15 min. Refresh token: 7 days, stored hashed in the DB, sent as an httpOnly cookie.
- Refresh rotates the token; reuse of an old refresh token revokes that token family.
- Logout revokes the current refresh token.

### FR2: Catalog
- Admin creates/updates titles (name, description, genres, year, poster URL).
- `GET /home` returns rows: Continue Watching, Trending/Popular, and by genre.
- `GET /search?q=&genre=&year=` searches title name and description (starts as `LIKE`, upgraded to a MySQL `FULLTEXT` index later).
- A dev seed creates demo titles (TMDB import is a later improvement). Use legally free videos only (Big Buck Bunny, Sintel, Tears of Steel).

### FR3: Upload and Transcoding
- Admin requests an upload URL for a title; the file goes directly to object storage with a presigned PUT (never through the API). Multipart upload for very large files is a later improvement.
- Admin calls `complete`; the API checks the file exists, marks the asset `queued`, and adds a BullMQ job (job id = asset id, so an asset never has two live jobs).
- Worker: download the source → `ffprobe` (rejects non-video files) → FFmpeg to 360p/720p/1080p HLS, never above the source resolution → upload segments, then playlists, with `master.m3u8` last → mark `ready` and set the title's stream URL in one transaction.
- Status flow: `pending_upload → queued → processing → ready | failed`, with a progress percentage and the attempt count.
- Failed jobs retry with exponential backoff (3 attempts). Only the last failure marks the asset `failed`, keeping the error message; an admin can then retry from the Studio page.
- Jobs are idempotent: output paths depend only on the asset id and old output is deleted before upload.
- A worker that dies mid-job is detected by BullMQ (stalled job) and the job is picked up again.

### FR4: Playback
- `GET /playback/:titleId` checks auth and asset status, then returns a signed manifest URL (HMAC, expires in ~5 min).
- Storage/Nginx validates the signature before serving segments.

### FR5: Watch Progress
- `POST /progress {titleId, positionSec, durationSec}` is called by the client every ~15s and on pause/close.
- Write goes to a Redis hash and the profile is added to a "dirty" set.
- A flush worker upserts dirty entries into MySQL in batches (`INSERT ... ON DUPLICATE KEY UPDATE`) every ~10s.
- Reads check Redis first, then MySQL.
- Accepted risk: a Redis crash loses at most ~10-15s of progress.

### FR6: Rate Limiting and Caching
- Token-bucket limiter in Redis (Lua script for atomicity): stricter on `/auth/*`, looser on browsing.
- Home feed cached with cache-aside (TTL 5 min + jitter), invalidated when the catalog changes.
- Stampede protection: a single request rebuilds an expired key (`SET NX`), others serve stale or wait briefly.

## 6. Architecture (Kept Simple)

A **modular monolith plus one worker**. Real microservices would add operational overhead without adding value for a solo project; the README should explain this choice and how it would be split at scale.

```
Client ─▶ API (Node.js/Express, JavaScript)
            ├─ auth module (email/password + OAuth)
            ├─ catalog module
            ├─ playback module (stream URL + watch progress)
            └─ assets module (upload + transcoding status)
            │
            ├──▶ MySQL 8   (users, titles, assets, history) via Prisma
            ├──▶ Redis     (cache, rate limit, progress buffer, BullMQ queue)
            └──▶ MinIO/S3  (raw uploads, HLS output)

Worker (separate process, scale N replicas)
   ├─ transcode worker  (BullMQ + FFmpeg)          [built]
   └─ progress flush loop (Redis ─▶ MySQL, every 10s) [built into worker process]
```

| Component | Choice | Reason |
|---|---|---|
| Language/API | JavaScript (Node.js, Express), with JSDoc and ESLint for code quality | Simple, no build step |
| Auth | Passport.js (`passport-google-oauth20`, optional `passport-github2`), `jsonwebtoken`, bcrypt (`bcryptjs`) | Standard OAuth strategies plus own JWT sessions |
| Database | MySQL 8 + Prisma ORM | Relational data (users, titles, history), foreign keys, transactions, existing MySQL experience |
| Cache/Queue | Redis + BullMQ | One dependency for cache, limiter, queue, buffer |
| Object storage | MinIO (S3-compatible) | Free, runs locally, same API as S3 |
| Video | FFmpeg, HLS | Industry-standard adaptive streaming |
| Frontend | React + Vite + React Router + hls.js (JavaScript) | Thin client: login, browse, search, My List, HLS player with resume |
| Packaging | Docker + Docker Compose (web, API, MySQL, Redis, MinIO) | One-command setup, same environment everywhere |
| Testing/CI | Jest, Supertest, GitHub Actions | Matches your existing experience |

## 7. Data Model

| Table | Key columns | Indexes / constraints |
|---|---|---|
| users | email, name, passwordHash (optional, empty for OAuth-only users), role | unique(email) |
| auth_identities | userId, provider (`google`/`github`), providerUserId, emailVerified | unique(provider, providerUserId), (userId) |
| refresh_tokens | userId, familyId, tokenHash, expiresAt, revokedAt | unique(tokenHash), (familyId), (expiresAt); expired rows removed by an hourly cleanup job |
| titles | name, description, year, durationMin, popularity, posterUrl, videoUrl | (popularity), (year); FULLTEXT planned |
| genres, title_genres | genre name; (titleId, genreId) join table | unique(name), unique(titleId, genreId), (genreId) |
| video_assets | titleId, sourceKey, status, progress, attempts, error, manifestKey, durationSec, renditions | (titleId), (status, updatedAt) |
| watch_history | userId, titleId, positionSec, durationSec, updatedAt | unique(userId, titleId) as the upsert key, (userId, updatedAt desc) |
| my_list | userId, titleId, addedAt | unique(userId, titleId) |

## 8. API Summary

```
POST /auth/signup | /auth/login | /auth/refresh | /auth/logout
GET  /auth/me
GET  /auth/google                      (redirect to Google consent)
GET  /auth/google/callback             (find/create user, issue tokens)

GET  /home                             (rows; Continue Watching + My List when logged in)
GET  /titles          GET /search      (?q=&genre=&page=&limit=)
GET  /titles/:id
GET  /playback/:titleId                (stream URL + resume position)
POST /progress        GET /progress/:titleId
GET  /my-list   POST /my-list   DELETE /my-list/:titleId

POST   /admin/titles    PUT|DELETE /admin/titles/:id
POST   /admin/titles/:id/upload        (creates an asset, returns a presigned upload URL)
GET    /admin/assets    GET /admin/assets/:id
POST   /admin/assets/:id/complete      (verifies the upload, enqueues the transcode)
POST   /admin/assets/:id/retry         (failed assets only)

GET  /health    GET /ready
```

OpenAPI/Swagger documentation is planned; for now the README lists every endpoint.

## 9. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Home p95 < 100 ms (cached); progress write p95 < 20 ms; playback auth p95 < 150 ms |
| Reliability | Crashed worker's job is retried; graceful shutdown; `/health` and `/ready` endpoints |
| Security | Hashed passwords, OAuth `state` check, httpOnly refresh cookie, short-lived tokens, signed URLs, rate limiting, input validation |
| Observability | Structured JSON logs (pino) with request IDs; basic metrics (latency, queue depth, cache hit ratio) |
| Quality | 80%+ test coverage on core modules; integration tests against a real MySQL test database (Docker, also a CI service container) |

## 10. Failure Modes

| Failure | Behavior |
|---|---|
| Redis down | Fall back to MySQL for reads and progress writes; limiter fails open for browsing, closed for `/auth/*` |
| Worker crashes mid-transcode | Job redelivered; idempotent output paths make the rerun safe |
| FFmpeg fails on a bad file | Retry, then mark `failed` with the error message |
| Duplicate progress heartbeats | Upsert keyed by (user, title); last write wins |

## 11. Milestones

| Week | Deliverable | Status |
|---|---|---|
| 1 | Repo, Docker Compose, CI, email/password auth + Google OAuth with refresh rotation, catalog, demo seed | Built |
| 2 | Upload + FFmpeg transcode worker with retries and status tracking, Studio page | Built |
| 3 | Playback, My List, player page with resume | Built (signed URLs and Redis progress buffering included) |
| 4 | Redis caching, rate limiter, k6 benchmarks, architecture diagram, demo video | Partly built (cache and rate limiter built; benchmarks and demo artifacts remain) |

## 12. Success Metrics (Measure and Record Real Numbers)

- Home feed p95 latency: cache off vs. on (k6)
- MySQL writes per second: direct progress writes vs. buffered; `EXPLAIN` output for key queries
- Transcode time per minute of video, and throughput with 1 vs. 3 workers
- Test coverage %, CI pipeline passing

## 13. Risks

| Risk | Mitigation |
|---|---|
| FFmpeg/HLS learning curve | Build the transcoding pipeline first (week 2) with a short sample clip |
| Scope creep | Stretch items only after the MVP is demoable |
| Large video files slow local testing | Use short (≤1 min) clips |
| Copyright | Only use open-licensed videos and TMDB metadata |
| OAuth account takeover via email linking | Link accounts only when the provider marks the email verified; verify `state` on every callback |
| No type safety in JavaScript | ESLint, JSDoc annotations, request validation (Zod/Joi), and strong test coverage |

## 14. Resume Bullets (fill in your real measurements)

Only use a bullet once the feature it describes exists and you have run it. Performance and write-reduction bullets still need real measurements before they can be claimed.

- Built a streaming backend (Node.js, JavaScript, MySQL, Prisma, Redis, FFmpeg) with HLS adaptive playback, expiring signed media routes, and Dockerized deployment.
- Implemented authentication with Google OAuth 2.0 (Passport.js, CSRF-safe `state`, verified-email account linking) alongside email/password signup, with JWT refresh-token rotation and reuse detection.
- Designed an async transcoding pipeline with BullMQ: presigned uploads, idempotent jobs, exponential-backoff retries, stalled-job recovery, and horizontally scalable FFmpeg workers.
- Reduced MySQL write load by X% with a Redis-buffered watch-progress path and batched flushes.
- Cut home-feed p95 latency from X ms to Y ms with cache-aside and stampede protection; added Redis Lua rate limiting and refresh-token rotation; N% test coverage in CI.
