# Production deployment

Containerised deployment (nginx + API + PostgreSQL with Docker Compose) is documented in [DOCKER.md](DOCKER.md); the checklist below applies to both.

## Checklist

1. **PostgreSQL** — a managed instance (with backups). Set `DATABASE_URL`.
2. **Environment** (`server/.env` or your platform's secret store):
   - `NODE_ENV=production`
   - `JWT_SECRET` — 64+ random characters (the server refuses to start with the example value)
   - `CLIENT_ORIGIN` / `APP_URL` — your public https origin(s)
   - `UPLOAD_DIR` — a persistent volume path (or implement the S3 adapter)
   - leave `ENABLE_DEV_FIXTURES` unset (fixtures can never show in production regardless)
   - `TRUST_PROXY=1` if (and only if) the API sits behind one reverse proxy/load balancer; otherwise leave 0
   - `GEMINI_API_KEY` for Dhaaga Bazaar AI Studio (a project with **billing enabled** — the free tier has no image-editing quota); optional `GEMINI_IMAGE_MODEL`, `GEMINI_ANALYSIS_MODEL`, `GEMINI_IMAGE_SIZE`, `AI_DAILY_GENERATIONS`. Keep it in the secret store, never in client variables. See `docs/AI_STUDIO.md` (costs, storage, troubleshooting)
   - AI Studio originals/versions live under `UPLOAD_DIR/private/ai/` — include them in the persistent volume / object storage and backups
   - `EMAIL_PROVIDER` once email is wired (the server warns at startup until then)
   - the server **refuses to start** in production with a weak `JWT_SECRET`, a localhost `CLIENT_ORIGIN` or a non-https `APP_URL`
3. **Build:** `npm ci && npm run build`
4. **Migrate:** `npm run prisma:deploy -w server` (non-destructive; applies pending migrations only — take a backup first)
5. **Seed taxonomy:** `npm run seed -w server` (idempotent; set `ADMIN_EMAIL`/`ADMIN_PASSWORD` once to create the first admin, then remove them)
6. **Run:** `cd server && SERVE_CLIENT=true node dist/index.js` serves the API and the built SPA from one process behind HTTPS (a reverse proxy or platform TLS). Alternatively host `client/dist` on a CDN and proxy `/api` and `/uploads` to the API.

## Backups

See the backup and recovery strategy in [AUDIT.md](AUDIT.md#4-backup-and-recovery-strategy). Commands: `npm run db:backup`, `npm run db:restore -- <dump> <new_database_name>`.

## Before public launch

- Wire an email provider for password resets (`server/src/routes/auth.ts`).
- Replace the draft Terms, Privacy and Returns pages with legally reviewed versions and fill `client/src/config/business.ts` with verified business details.
- Configure backups for the database and the uploads volume.
- Point monitoring at `GET /api/health`.

## Verified locally

The production build was run with `NODE_ENV=production SERVE_CLIENT=true ENABLE_DEV_FIXTURES=true`: fixtures stayed hidden, SPA routes resolved, security headers (CSP, HSTS, X-Frame-Options, nosniff) were present, and the homepage rendered without browser console errors.
