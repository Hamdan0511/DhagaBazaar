# Running Dhaaga Bazaar with Docker

The repository ships a production-style Compose stack and a development override with hot reload. The native workflow (`npm run dev`, PostgreSQL in `./.pgdata` on port 5433) is unchanged and independent. The two never share a database.

## Architecture

```
 browser ──► web (nginx, :8080 on 127.0.0.1) ──/api, /uploads──► server (Express API, :4000) ──► db (PostgreSQL 18)
             serves the built SPA                                Prisma, Gemini (outbound)        not published
             no secrets, non-root                                non-root, read-only rootfs       internal network only
```

| Service | Image (Dockerfile target) | Role |
|---|---|---|
| `web` | `client/Dockerfile` → `runtime` (nginx-unprivileged 1.27) | Serves `client/dist` with SPA fallback and security headers. Proxies `/api/*` and `/uploads/*` to the API, so the browser sees **one origin** (cookies, CSRF header and CORS just work). Never serves files from disk under `/uploads`. |
| `server` | `server/Dockerfile` → `runtime` (node 24 slim) | Bundled API (`dist/index.js`) with production dependencies only. Runs as `node`, read-only root filesystem, graceful shutdown on SIGTERM, health check on `/api/health`. |
| `db` | `postgres:18-bookworm` | Data in the `dhaaga-bazaar_pgdata` volume; `pg_isready` health check; reachable only on the internal `backend` network. |
| `migrate` | `server/Dockerfile` → `migrator` | One-off tool container (`profiles: [tools]`): `prisma migrate deploy`, the seed, maintenance scripts. Not part of `up`. |

Networks: `backend` is `internal` (no internet access) and holds `db`, `server` and `migrate`. `frontend` holds `web` and `server`; it also gives the API outbound access for Google Gemini.

Start order is enforced by health checks: `db` healthy → `server` healthy → `web`.

## Persistent data

| Volume | Mounted at | Contents |
|---|---|---|
| `dhaaga-bazaar_pgdata` | `/var/lib/postgresql` in `db` | The PostgreSQL cluster |
| `dhaaga-bazaar_uploads` | `/app/server/uploads` in `server` and `migrate` | `public/products/` (listing photos) and `private/` (verification documents, AI Studio originals and versions) |

- Volumes survive `docker compose down`, image rebuilds, container recreation and Docker restarts.
- They are deleted only by `docker compose down -v` or `docker volume rm`. **Never run either unless you intend to delete the data.**
- Volume names are scoped to the Compose project (`dhaaga-bazaar`), so a test project started with `-p something-else` gets its own volumes and cannot touch this data.

Private files stay private. nginx proxies `/uploads` to the API, which:
- returns approved product photos publicly;
- shows photos still in review only to their supplier and admins;
- returns 404 for every other path, including `private/…`.

Verification documents are served only through the admin route `/api/admin/documents/:id/file` (guests get 401, suppliers and retailers 403).

## Configuration

```bash
cp .env.docker.example .env.docker      # git-ignored; never commit it
```

Fill in at least:
- `POSTGRES_PASSWORD`: letters, digits, `-` and `_` only, because it goes inside a URL.
- `JWT_SECRET`: 96 hex characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `CLIENT_ORIGIN` and `APP_URL`: your https origin.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`, for the first seed only.
- `GEMINI_API_KEY`.

`.env.docker` is passed both to Compose for interpolation (`--env-file .env.docker`) and to the **API container only** (`env_file`). The `web` container receives no variables, so the Gemini key, database password and JWT secret never reach nginx or the JavaScript bundle. Nothing from `.env*` is copied into any image (`.dockerignore`).

**Local testing on http://localhost.** Production mode refuses localhost origins and http URLs. To run the production stack on your own machine, set:

```
ALLOW_INSECURE_LOCALHOST=true
CLIENT_ORIGIN=http://localhost:8080
APP_URL=http://localhost:8080
```

This relaxes only those two checks, and only for localhost addresses. The JWT secret check stays, and the API logs a warning. Never set it on a server.

**Gemini.** `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_ANALYSIS_MODEL`, `GEMINI_IMAGE_SIZE` and the daily limits go to the API container only. Image editing needs a billing-enabled Google project (see `docs/AI_STUDIO.md`).

## Commands

Every command runs from the repository root. The `npm run docker:*` scripts are shorthands for the commands shown.

| Task | Command |
|---|---|
| Build all images | `npm run docker:build` (`docker compose --env-file .env.docker --profile tools build`) |
| First start: database | `docker compose --env-file .env.docker up -d db` |
| Run migrations (controlled step) | `npm run docker:migrate` (`docker compose --env-file .env.docker run --rm migrate`, which runs `prisma migrate deploy`; never reset) |
| Seed categories and first admin (safe to repeat; it only adds what is missing) | `npm run docker:seed` |
| Start everything | `npm run docker:up` (`docker compose --env-file .env.docker up -d`) |
| Status and health | `npm run docker:ps` (`docker compose --env-file .env.docker ps`) |
| Logs (follow) | `npm run docker:logs`, or a single service: `docker compose --env-file .env.docker logs -f server` |
| Restart services | `npm run docker:restart`, or `docker compose --env-file .env.docker restart server` |
| Stop (keep containers) | `docker compose --env-file .env.docker stop` |
| Remove containers, **keep data** | `npm run docker:down` (`docker compose --env-file .env.docker down`, without `-v`) |
| Rebuild after code changes | `npm run docker:build && npm run docker:migrate && npm run docker:up` |
| Back up database and uploads | `npm run docker:backup` |
| Restore into a new database | `npm run docker:restore -- <backupDir> --into <new_db> [--with-uploads]` |
| psql shell | `docker compose --env-file .env.docker exec db psql -U dhaaga -d dhaaga_bazaar` |
| One-off script | `docker compose --env-file .env.docker run --rm migrate npx tsx prisma/<script>.ts` |

URLs:
- Production stack: **http://localhost:8080**. The API is at http://localhost:8080/api/health; it isn't published separately.
- Admin: http://localhost:8080/login?as=admin.

### First run, step by step

```bash
cp .env.docker.example .env.docker     # edit it
npm run docker:build
docker compose --env-file .env.docker up -d db
npm run docker:migrate
npm run docker:seed
npm run docker:up
npm run docker:ps                      # db, server and web should all be "healthy"
```

## Backup and restore

```bash
npm run docker:backup
# → backups/docker-<time>/database.dump (pg_dump custom format, verified readable),
#   uploads.tar (the whole uploads volume), manifest.json (record counts)
```

Restore always creates a **new** database. It refuses to run if the name already exists, so it can never overwrite data:

```bash
npm run docker:restore -- backups/docker-<time> --into dhaaga_restored --with-uploads
# then: set POSTGRES_DB=dhaaga_restored in .env.docker
npm run docker:migrate
npm run docker:up
```

`--with-uploads` adds files from the backup to the uploads volume and never overwrites existing files. The previous database stays in the cluster until you remove it yourself.

Copy backups off the machine regularly. A volume is not a backup.

## Moving the existing local database into Docker

**Not done automatically.** The Docker stack starts with its own empty database. Your current data stays in the native cluster (`.pgdata`, port 5433) until you choose to move it.

The supported path uses only copies, and the native database is only read:

```bash
npm run db:start                                   # native PostgreSQL running
npm run db:backup                                  # → backups/<time>/dhaaga_bazaar.dump + uploads/
docker compose --env-file .env.docker up -d db
npm run docker:restore -- backups/<time> --into dhaaga_bazaar_live --with-uploads
# edit .env.docker: POSTGRES_DB=dhaaga_bazaar_live
npm run docker:migrate                             # applies any newer migrations
npm run docker:up
```

- Check the site, then stop using the native stack for writes, so the two copies don't diverge.
- Keep the native `.pgdata` and the backup until you are confident.
- This path was tested on a copy: the restored database had the same counts as the source, and Prisma reported "schema up to date".

## Development with hot reload

```bash
npm run docker:dev       # docker compose … -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- **Vite dev server (HMR):** http://localhost:5180. It proxies `/api` and `/uploads` to the API container.
- **API with `tsx watch`:** http://localhost:4001.
- **PostgreSQL:** 127.0.0.1:5434, this machine only.
- **Source:** bind-mounted. Linux `node_modules` live in container volumes. File watching polls (`CHOKIDAR_USEPOLLING`), because file events from Windows and macOS bind mounts are unreliable.
- **Data:** the same database and uploads volumes as the production stack. Switch back with `npm run docker:up`.
- **Stop:** `npm run docker:dev:down`.
- **Native workflow:** `npm run dev` on ports 5173, 4000 and 5433 can still run alongside.

## Running the test suites against Docker

The browser scripts accept `BASE_URL`:

```bash
BASE_URL=http://localhost:8080 node scripts/e2e-registration.mjs out
BASE_URL=http://localhost:8080 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/e2e-admin-review.mjs out <photo.jpg> <tiny.jpg> <photo.png> <photo.webp> <large.jpg>
BASE_URL=http://localhost:8080 node scripts/qa-crawl.mjs out
```

- **e2e-journeys** reads the database directly. Publish `db` temporarily, for example with an override that maps `127.0.0.1:5436:5432`, and pass `DATABASE_URL`.
- **Test-data cleanup:** the cleanup script refuses production mode, so on a local test stack only run `docker compose --env-file .env.docker run --rm -e NODE_ENV=development migrate npx tsx prisma/cleanup-e2e.ts`.
- **Rate limit:** many runs back to back from one IP exceed `RATE_LIMIT_API` (600 per 5 minutes). Raise it in your local `.env.docker` while testing.
- **Gemini cost:** `e2e-ai-studio.mjs` calls Gemini. The Docker verification used only the status endpoint, which makes no Gemini call.

## Security notes

- Both runtime images run as non-root users: `node` (uid 1000) and `nginx` (uid 101).
- The root filesystems are read-only, and `no-new-privileges` is set.
- PostgreSQL is not published. `web` binds to `127.0.0.1` by default. On a server, put a TLS reverse proxy or load balancer in front of port 8080 and keep `TRUST_PROXY=1`, since nginx is one hop.
- nginx sends CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` (camera allowed for this site only). The API keeps Helmet's headers.
- Request bodies up to 80 MB are allowed (8 photos × 8 MB). AI requests get a 200 s proxy timeout.
- Secrets in `.env.docker` are visible to anyone who can run `docker inspect` on the host. On shared servers, use your platform's secret store or Docker secrets.

## Production checklist

1. A real domain with TLS at the edge. Set `CLIENT_ORIGIN` and `APP_URL` to it and remove `ALLOW_INSECURE_LOCALHOST`.
2. A strong `POSTGRES_PASSWORD` and `JWT_SECRET`. After the first seed, clear `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. `npm run docker:backup` before every deployment, then `npm run docker:build`, `npm run docker:migrate` and `npm run docker:up`.
4. Off-site copies of the backups.
5. For more than one API instance, switch uploads to object storage (`server/src/lib/storage.ts`) and the rate limits to a shared store. See `docs/DEPLOYMENT.md`.
