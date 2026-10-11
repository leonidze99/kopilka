# syntax=docker/dockerfile:1

# One image: the API also serves the built web app from the same origin.
#   docker build -t kopilka .                                  # the app
#   docker build --target migrate -t kopilka-migrate .         # migrations
#   docker run -e DATABASE_URL=... kopilka-migrate             # before a release
#   docker run -p 3000:3000 -e DATABASE_URL=... -e JWT_ACCESS_SECRET=... kopilka

ARG NODE_VERSION=22

# Debian, not Alpine: argon2 and Prisma's migration engine ship native
# binaries, and glibc builds are the ones they test first.
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm of the version in package.json#packageManager.
RUN corepack enable
WORKDIR /app

# ---- build: all dependencies, then shared -> web -> api ---------------------
FROM base AS build
# Manifests first: this layer and the install are reused until a
# dependency changes, not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The api postinstall runs `prisma generate`: it needs the schema.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @kopilka/shared build \
 && pnpm --filter web build \
 && pnpm --filter api build

# ---- migrate: `prisma migrate deploy`, run once per release ------------------
# The Prisma CLI is a devDependency with a large tree (Studio, a dev
# database, TypeScript): it belongs to a one-off job, not to every app
# container. This stage reuses the build stage, which already has it.
FROM build AS migrate
# The migration engine links against OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- runtime (default): production dependencies and the build output --------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Only the api and the workspace packages it depends on (shared), without
# devDependencies. No scripts: `prisma generate` ran in the build stage and
# its client is compiled into dist; the migration engine is not needed here.
# Known cost: the lockfile resolves @prisma/client together with its
# optional peer, the Prisma CLI (~200 MB with Studio and TypeScript), and
# --prod keeps it. Moving the schema and the CLI into a package of their
# own would drop it.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter api...
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

WORKDIR /app/apps/api
ENV PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist
EXPOSE 3000
# Not root: a hole in the app does not hand over the container.
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/api/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node directly, not `pnpm start`: SIGTERM from the platform reaches the
# app, which closes connections before exiting (enableShutdownHooks).
CMD ["node", "dist/main.js"]
