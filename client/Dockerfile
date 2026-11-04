# syntax=docker/dockerfile:1.7
# Dhaaga Bazaar web client — Vite build served by unprivileged nginx. Build context: repository root.
#
#   deps     workspace dependencies (also used by docker-compose.dev.yml for the Vite dev server)
#   build    production bundle (client/dist)
#   runtime  nginx (non-root, port 8080) serving the bundle and proxying /api + /uploads to the API

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,target=/root/.npm npm ci --workspaces --include-workspace-root

FROM deps AS build
COPY shared shared
COPY client client
# No secrets are passed to the build: the bundle talks to the API on the same origin (/api).
RUN npm run build -w client

FROM ${NGINX_IMAGE} AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
