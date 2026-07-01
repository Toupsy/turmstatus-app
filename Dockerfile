# ============================================================
# Turmstatus – Multi-Stage-Build (TypeScript-Monorepo)
#   build:   installiert Deps, baut Web-/Admin-SPA (Vite) + API (tsup)
#   runtime: schlankes Image mit dist/, Prod-node_modules, Migrationen, SPAs
# EIN Prozess bedient beide Ports (Public + interner Admin).
# ============================================================

FROM node:20-alpine AS build
WORKDIR /app
# Build-Tools für die native better-sqlite3-Kompilierung.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci
COPY . .
ARG APP_VERSION=0.0.0
ENV APP_VERSION=${APP_VERSION}
RUN npm run build
# Dev-Abhängigkeiten entfernen → node_modules nur mit Laufzeit-Deps.
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libstdc++ wget
ENV NODE_ENV=production \
    PORT=3002 \
    ADMIN_PORT=3003 \
    ADMIN_BIND=0.0.0.0 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/turmstatus.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/admin/dist ./apps/admin/dist

RUN mkdir -p /app/data
EXPOSE 3002 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health >/dev/null 2>&1 || exit 1

CMD ["node", "apps/api/dist/server.js"]
