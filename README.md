# StreamBox

A small Netflix-style streaming app. I built it backend-first: the interesting part is what happens after an admin uploads a video (it gets queued, transcoded to several qualities, and published as adaptive HLS), but there is a full React frontend on top so you can actually use it.

The full product spec is in [docs/PRD.md](docs/PRD.md), including what is built and what is still to do.

```
frontend/   React + Vite + hls.js
backend/    Express, Prisma, MySQL, BullMQ, FFmpeg
docker-compose.yml   web, api, worker, mysql, redis, minio
```

## Run it

```bash
cp .env.example .env     # optional
docker compose up --build
```

Then open http://localhost:5173 and sign up. The first start creates the tables and seeds a demo catalog.

## Deploying

For a single VM production setup with Docker Compose and automatic HTTPS, see [the deployment guide](docs/DEPLOYING.md) and `docker-compose.prod.yml`.

| | |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:3000 (`/health`, `/ready`) |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| MySQL | localhost:3307 (`root` / `root`) |
| Dev admin | `admin@streambox.dev` / `admin1234` |

The seeded titles play two public HLS test streams. To use your own video, sign in as the admin and open **Studio**.

## Uploading a video

1. Sign in as the admin, open Studio, and create a title (or pick an existing one).
2. Choose a video file and hit *Upload and transcode*. No video? `./scripts/make-sample-video.sh` makes a 20 s test clip.
3. Watch the job move through Queued → Transcoding → Ready. Once it's ready the title plays your video.

What happens behind that button:

```
browser ──PUT──▶ MinIO  raw/<assetId>/file.mp4        (presigned URL, the API never sees the bytes)
browser ──POST /admin/assets/:id/complete──▶ API
API     ──checks the file exists, marks it queued, adds a BullMQ job (jobId = assetId)
worker  ──downloads the source, ffprobe, encodes 360p / 720p / 1080p (never above the source)
worker  ──uploads hls/<assetId>/{360p,720p,..}/*.ts + index.m3u8, then master.m3u8 last
worker  ──marks the asset ready and sets the title's stream URL in one transaction
```

Things worth knowing about it:

- **Retries.** A failed job is retried 3 times with exponential backoff. Only after the last attempt does the asset become `failed`, and the Studio page then shows a Retry button.
- **Re-running is safe.** Output paths depend only on the asset id and old output is deleted first, so a retry (or a job picked up twice) can't leave a mess.
- **Crashes.** If a worker dies mid-job, BullMQ notices the stalled job and hands it to another worker. You can try it: `docker compose kill worker` while something is transcoding, then `docker compose up -d worker`.
- **Scaling.** `docker compose up -d --scale worker=3` runs three workers. Each handles `TRANSCODE_CONCURRENCY` jobs at a time.
- **Bad uploads.** ffprobe runs first, so a file with no video stream fails fast with a readable error.

## Features

- Email/password signup and Google sign-in
- Home page with Continue Watching, My List, Trending and a row per genre
- Search, My List, resume-where-you-left-off, progress saved every 15 s
- Admin Studio: create titles, upload videos, watch transcoding progress, retry failures

## API

| | | |
|---|---|---|
| POST | /auth/signup, /auth/login | `{email, password, name?}` |
| POST | /auth/refresh, /auth/logout | uses the refresh cookie |
| GET | /auth/me | |
| GET | /auth/google | only when Google keys are set |
| GET | /home | rows; more rows when logged in |
| GET | /titles, /search | `?q=&genre=&page=&limit=` |
| GET | /titles/:id | |
| GET | /playback/:titleId | stream URL + resume position |
| POST | /progress | `{titleId, positionSec, durationSec}` |
| GET/POST/DELETE | /my-list | |
| POST/PUT/DELETE | /admin/titles(/:id) | admin |
| POST | /admin/titles/:id/upload | admin, returns a presigned upload URL |
| GET | /admin/assets, /admin/assets/:id | admin |
| POST | /admin/assets/:id/complete, /retry | admin |

## Google sign-in

1. Google Cloud Console → APIs & Services → OAuth consent screen (External, add yourself as a test user).
2. Credentials → Create OAuth client ID → Web application.
3. Authorized redirect URI: `http://localhost:3000/auth/google/callback`
4. Put the id and secret in `.env`, then `docker compose up -d --force-recreate api`.

## Development

```bash
# backend tests need MySQL running (they use their own streambox_test database)
docker compose up -d mysql
cd backend && npm install && npm test

# run things outside docker
cd backend && cp .env.example .env && npx prisma db push && npm run db:seed && npm run dev
cd backend && npm run worker          # needs ffmpeg installed, plus redis and minio running
cd frontend && npm install && npm run dev
```

Useful: `docker compose logs -f worker`, `docker compose exec api npm run db:seed`, `docker compose down -v` (wipes all data).

## Notes and decisions

- The browser only talks to the Vite dev server, which proxies API paths to Express. That avoids CORS and lets the refresh cookie work. It also means UI routes are `/find` and `/list`, not `/search` and `/my-list`.
- Refresh tokens rotate on every use through one atomic `UPDATE ... WHERE revokedAt IS NULL`. Replaying an old token revokes the whole family.
- A Google login attaches to an existing account only if Google says the email is verified.
- MySQL has no TTL indexes, so the API deletes expired refresh tokens once an hour.
- Presigned upload URLs are signed for the address the browser uses (`S3_PUBLIC_ENDPOINT`), while the API talks to MinIO on the Docker network (`S3_ENDPOINT`). Playback from uploaded assets uses expiring HMAC-signed `/media/...` routes; the bucket stays private.
- Watch progress is buffered in Redis and flushed to MySQL by a worker every 10 seconds. If Redis is unavailable, the API writes directly to MySQL.
- The home feed uses a 5-minute Redis cache with jitter and stale-while-rebuild behavior. Catalog edits and completed transcodes bump its cache version.
- API requests use Redis token-bucket rate limits (stricter for `/auth/*`). Authentication requests fail closed when Redis is unavailable; browsing remains available.
- Tables are created with `prisma db push` for now. Moving to real migrations is on the list.
- Shortcuts that are fine for local dev but not for production: MySQL runs as root, the admin password is seeded, and demo video URLs point to public sample streams.

## Not done yet

- GitHub OAuth, TMDB metadata import, MySQL FULLTEXT search, and OpenAPI/Swagger docs
- Exported metrics and k6 benchmarks with measured results
- Multipart uploads for very large files (a single presigned PUT is used)
