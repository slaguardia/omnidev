# syntax=docker/dockerfile:1.4
#
# Job worker + agent pipeline only (build context = repository root).
# Runs `node worker.cjs` — no Next.js. Pair with ../web/Dockerfile for the dashboard/API.
#
# Cache mounts omitted for Railway compatibility (see ../web/Dockerfile).
#
# ---------- build-base: includes native addon build tools (python3, make, g++) ----------
FROM ubuntu:22.04 AS build-base

ENV CI=true

RUN apt-get update && apt-get install -y \
    bash \
    curl \
    ca-certificates \
    gnupg \
    wget \
    gosu \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y \
    nodejs \
    python3 \
    make \
    g++ \
    git \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/internal/bin \
    && mv /usr/bin/git /opt/internal/bin/git \
    && chmod 755 /opt/internal/bin/git

RUN echo '#!/bin/bash' > /usr/bin/git && \
    echo 'echo "[BLOCKED] git access denied - all git operations must go through the app API"' >> /usr/bin/git && \
    echo 'echo "Claude Code cannot access git for security reasons."' >> /usr/bin/git && \
    echo 'exit 1' >> /usr/bin/git && \
    chmod 755 /usr/bin/git

# ---------- runner-base: minimal runtime (no build tools — saves ~200 MB) ----------
FROM ubuntu:22.04 AS runner-base

ENV CI=true

RUN apt-get update && apt-get install -y \
    bash \
    curl \
    ca-certificates \
    gnupg \
    wget \
    gosu \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y \
    nodejs \
    git \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/internal/bin \
    && mv /usr/bin/git /opt/internal/bin/git \
    && chmod 755 /opt/internal/bin/git

RUN echo '#!/bin/bash' > /usr/bin/git && \
    echo 'echo "[BLOCKED] git access denied - all git operations must go through the app API"' >> /usr/bin/git && \
    echo 'echo "Claude Code cannot access git for security reasons."' >> /usr/bin/git && \
    echo 'exit 1' >> /usr/bin/git && \
    chmod 755 /usr/bin/git

FROM build-base AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY packages ./packages
COPY src/shared/package.json ./src/shared/
COPY src/web/package.json ./src/web/
COPY src/worker/package.json ./src/worker/

ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild better-sqlite3 \
  && pnpm exec prisma generate --schema=/app/prisma/schema.prisma \
  && mkdir -p /tmp/native-deps/@prisma /tmp/native-deps/.prisma \
  && PRISMA_DIR=$(find node_modules/.pnpm -path '*/@prisma/client' -type d | head -1) \
  && cp -rL "$PRISMA_DIR" /tmp/native-deps/@prisma/client \
  && DOT_PRISMA_DIR=$(find node_modules/.pnpm -path '*/.prisma/client' -type d | head -1) \
  && cp -rL "$DOT_PRISMA_DIR" /tmp/native-deps/.prisma/client \
  && SQLITE_DIR=$(find node_modules/.pnpm -path '*/better-sqlite3' -name better-sqlite3 -type d | head -1) \
  && cp -rL "$SQLITE_DIR" /tmp/native-deps/better-sqlite3

FROM deps AS builder
WORKDIR /app
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run worker:build \
  && npx tsup src/web/src/cli/index.ts --out-dir dist/cli --format cjs --target node18 --no-splitting --clean

FROM build-base AS prod-deps
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY packages ./packages
COPY src/shared/package.json ./src/shared/
COPY src/web/package.json ./src/web/
COPY src/worker/package.json ./src/worker/
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm prune --prod --ignore-scripts \
  && pnpm rebuild better-sqlite3

FROM runner-base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install -g pnpm @anthropic-ai/claude-code@~2.1.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN rm -rf /app/node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# Native/generated deps pruned or symlinked by pnpm — dereference from deps stage.
COPY --from=deps --chown=nextjs:nodejs /tmp/native-deps/@prisma ./node_modules/@prisma
COPY --from=deps --chown=nextjs:nodejs /tmp/native-deps/.prisma ./node_modules/.prisma
COPY --from=deps --chown=nextjs:nodejs /tmp/native-deps/better-sqlite3 ./node_modules/better-sqlite3

COPY --from=builder --chown=nextjs:nodejs /app/dist/index.cjs ./worker.cjs
COPY --from=builder --chown=nextjs:nodejs /app/dist/index.cjs.map ./worker.cjs.map

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

RUN mkdir -p workspaces data && chown nextjs:nodejs workspaces data

RUN mkdir -p /secrets && chown nextjs:nodejs /secrets

COPY src/shared/docker/docker-entrypoint-common.sh /opt/omnidev/entrypoint-common.sh
COPY src/worker/docker-entrypoint.sh /entrypoint.sh
RUN chmod 755 /opt/omnidev/entrypoint-common.sh /entrypoint.sh && chown nextjs:nodejs /opt/omnidev/entrypoint-common.sh /entrypoint.sh

COPY claude-code-wrapper.sh /usr/local/bin/claude-code-wrapper
RUN chmod 755 /usr/local/bin/claude-code-wrapper && chown nextjs:nodejs /usr/local/bin/claude-code-wrapper

COPY --chown=nextjs:nodejs scripts/ ./scripts/
COPY --chown=nextjs:nodejs src/worker/scripts/ ./src/worker/scripts/
RUN chmod 755 ./scripts/*.sh ./src/worker/scripts/*.sh 2>/dev/null; \
    chmod 755 ./src/worker/scripts/*.mjs 2>/dev/null; true

COPY src/worker/scripts/create-task.sh /usr/local/bin/create-task
RUN chmod 755 /usr/local/bin/create-task

COPY --from=builder --chown=nextjs:nodejs /app/dist/cli/index.cjs /opt/internal/bin/ralph.cjs
RUN echo '#!/usr/bin/env node' > /usr/local/bin/ralph && \
    echo 'require("/opt/internal/bin/ralph.cjs");' >> /usr/local/bin/ralph && \
    chmod 755 /usr/local/bin/ralph

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "worker.cjs"]
