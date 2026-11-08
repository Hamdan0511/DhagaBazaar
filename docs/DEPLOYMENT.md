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
3. **Build:** `npm ci && npm run build` from the repository root (see [Render](#render) for per-service commands)
4. **Migrate:** `npm run prisma:deploy -w server` (non-destructive; applies pending migrations only — take a backup first)
5. **Seed taxonomy:** `npm run seed -w server` (idempotent; set `ADMIN_EMAIL`/`ADMIN_PASSWORD` once to create the first admin, then remove them)
6. **Run:** `cd server && SERVE_CLIENT=true node dist/index.js` serves the API and the built SPA from one process behind HTTPS (a reverse proxy or platform TLS). Alternatively host `client/dist` on a CDN and proxy `/api` and `/uploads` to the API.

## Render

This repository is an npm-workspaces monorepo: `client` and `server` both depend on the `shared` workspace (`@dhaaga/shared`, not published to npm) and there is one `package-lock.json` at the root. **Both services must build from the repository root — leave Root Directory empty.** With Root Directory `client` or `server`, Render installs that folder alone: `@dhaaga/shared` can't be resolved (the frontend then fails type-checking with dozens of cascading errors), and a Docker build fails with `"/server": not found`.

### Backend — Web Service `dhaaga-bazaar-api`

| Setting | Value |
|---|---|
| Language | Node |
| Root Directory | *(empty)* |
| Build Command | `npm ci --include=dev && npm run prisma:generate -w server && npm run build -w server` |
| Pre-Deploy Command | `npm run prisma:deploy -w server` |
| Start Command | `cd server && node dist/index.js` |
| Health Check Path | `/api/health` |

- **Free plan:** there is no Pre-Deploy Command. Use the Start Command `npm run prisma:deploy -w server && cd server && node dist/index.js` instead.
- **Why `--include=dev`:** the build tools (`prisma`, `tsup`) are dev dependencies, and npm skips them when `NODE_ENV=production` is set.
- **Why not `npm start -w server`:** it runs `node --env-file=.env`, which fails because there is no `.env` file on Render.

Environment variables:

| Key | Value |
|---|---|
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Render PostgreSQL **Internal Database URL** |
| `JWT_SECRET` | at least 48 random characters |
| `APP_URL` | the frontend's https URL |
| `CLIENT_ORIGIN` | the frontend's https URL |
| `TRUST_PROXY` | `1` |

- Optional variables: Gemini and Razorpay keys, see [AI_STUDIO.md](AI_STUDIO.md) and [PAYMENTS.md](PAYMENTS.md).
- Render sets `PORT` itself.
- **Uploads:** they need a persistent Render Disk mounted at `/opt/render/project/src/server/uploads`. Without it, uploaded files are lost on every deploy.
- **First admin:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run `cd server && npx tsx prisma/seed.ts` once from the Render Shell. Afterwards, remove both variables.

### Frontend — Static Site

| Setting | Value |
|---|---|
| Root Directory | *(empty)* |
| Build Command | `npm ci --include=dev && npm run build -w client` |
| Publish Directory | `client/dist` |
| Environment | `NODE_VERSION` = `24` |

The client calls the API at relative `/api` and `/uploads` paths, so the static site must proxy them to the backend. Under **Redirects/Rewrites**, add these rules in this order:

| Source | Destination | Action |
|---|---|---|
| `/api/*` | `https://<backend>.onrender.com/api/*` | Rewrite |
| `/uploads/*` | `https://<backend>.onrender.com/uploads/*` | Rewrite |
| `/*` | `/index.html` | Rewrite |

Because the browser only ever talks to the frontend origin, session cookies and CSRF work without cross-origin configuration.

- Set the backend's `APP_URL` and `CLIENT_ORIGIN` to the static site's https URL.
- The Razorpay webhook URL is then `https://<frontend>/api/webhooks/razorpay`.

**Alternative: a single service.** Add `&& npm run build -w client` to the backend Build Command and set `SERVE_CLIENT=true`. The API then serves the built SPA itself, and no static site or rewrites are needed.

### Builds and tests

- `npm run build -w client` type-checks application code only (`client/tsconfig.app.json`), then runs `vite build`.
- Test files under `client/src/test/` are excluded from the production build.
- Tests are still type-checked by `npm run typecheck -w client` (`client/tsconfig.json`) and run by `npm run test -w client`. Run both before deploying.

## Backups

See the backup and recovery strategy in [AUDIT.md](AUDIT.md#4-backup-and-recovery-strategy). Commands: `npm run db:backup`, `npm run db:restore -- <dump> <new_database_name>`.

## Before public launch

- Wire an email provider for password resets (`server/src/routes/auth.ts`).
- Replace the draft Terms, Privacy and Returns pages with legally reviewed versions and fill `client/src/config/business.ts` with verified business details.
- Configure backups for the database and the uploads volume.
- Point monitoring at `GET /api/health`.

## Verified locally

The production build was run with `NODE_ENV=production SERVE_CLIENT=true ENABLE_DEV_FIXTURES=true`: fixtures stayed hidden, SPA routes resolved, security headers (CSP, HSTS, X-Frame-Options, nosniff) were present, and the homepage rendered without browser console errors.
