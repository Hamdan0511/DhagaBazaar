# syntax=docker/dockerfile:1.7
# Dhaaga Bazaar API — multi-stage build. Build context: repository root.
#
#   deps      all workspace dependencies (Linux), used to build and for development
#   build     Prisma client + bundled server (tsup)
#   migrator  build output + Prisma CLI: runs `prisma migrate deploy` / seed as a controlled step
#   runtime   production dependencies only, non-root, no build tools, no secrets

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
# OpenSSL is required by the Prisma query engine; tini-style init is provided by `init: true` in Compose.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

# ── deps: install every workspace from the lockfile ───────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,target=/root/.npm npm ci --workspaces --include-workspace-root

# ── build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY shared shared
COPY server server
RUN npx prisma generate --schema server/prisma/schema.prisma \
 && npm run build -w server

# ── migrator: one-off migrations / seed (has the Prisma CLI and tsx) ──────────
FROM build AS migrator
WORKDIR /app/server
RUN mkdir -p uploads && chown -R node:node /app/server/uploads
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Production dependencies of the server workspace only (no dev tools, no client packages).
# npm keeps the Prisma CLI and TypeScript because @prisma/client lists them as optional peers;
# the API never uses them (migrations run from the separate `migrator` stage), so drop them.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w server --include-workspace-root=false \
 && rm -rf node_modules/prisma node_modules/@prisma/engines node_modules/@prisma/config node_modules/typescript node_modules/effect node_modules/fast-check \
 && npm cache clean --force
# Generated Prisma client (engine built for this Linux image) and the bundled server.
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/server/dist /app/server/dist
COPY --from=build /app/server/prisma /app/server/prisma
WORKDIR /app/server
# Uploads live on a volume mounted here; the directory must belong to the unprivileged user.
RUN mkdir -p uploads/public uploads/private && chown -R node:node /app/server/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Exec form: node is PID 1's child under `init`, receives SIGTERM and shuts down gracefully (src/index.ts).
CMD ["node", "dist/index.js"]
