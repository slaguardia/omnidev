# syntax=docker/dockerfile:1.4
#
# Next.js / API production image only (build context = repository root).
# Does not include the job worker — see ../worker/Dockerfile.
#
# Note: BuildKit cache mounts are omitted — Railway requires id=s/<service-uuid>-… per mount,
# which cannot be shared across services or substituted from ARG. Local/GitLab builds stay fast enough without them.
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

# Dummy URL for datasource; runtime uses real `DATABASE_URL`. Use root `pnpm exec prisma` (not `--filter`) so Prisma does not run internal `pnpm add` (fails in Docker).
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild better-sqlite3 \
  && pnpm exec prisma generate --schema=/app/prisma/schema.prisma

# Inherit /app/node_modules + global pnpm from deps (avoids extra `npm install -g pnpm` during parallel builds).
FROM deps AS builder
WORKDIR /app
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SHOWCASE_MODE=false
ENV NEXT_PUBLIC_SHOWCASE_MODE=${NEXT_PUBLIC_SHOWCASE_MODE}

RUN pnpm --filter @omnidev/web build

FROM build-base AS prod-deps
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY packages ./packages
COPY src/shared/package.json ./src/shared/
COPY src/web/package.json ./src/web/
COPY src/worker/package.json ./src/worker/
# Reuse full install + generated Prisma client from deps (second `prisma generate` triggers pnpm add and fails in CI).
COPY --from=deps /app/node_modules ./node_modules
# Prune removes devDeps including `prisma`; root postinstall must not run until rebuild.
RUN pnpm prune --prod --ignore-scripts \
  && pnpm rebuild better-sqlite3

FROM runner-base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install -g pnpm @anthropic-ai/claude-code@~2.1.0 prisma@~5.22.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p src/web/.next
RUN chown -R nextjs:nodejs src/web/.next

COPY --from=builder --chown=nextjs:nodejs /app/src/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/src/web/.next/static ./src/web/.next/static

RUN rm -rf /app/node_modules
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

COPY --chown=nextjs:nodejs docs/ ./docs/

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

RUN mkdir -p workspaces data && chown nextjs:nodejs workspaces data

RUN mkdir -p /secrets && chown nextjs:nodejs /secrets

COPY src/shared/docker/docker-entrypoint-common.sh /opt/omnidev/entrypoint-common.sh
COPY src/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod 755 /opt/omnidev/entrypoint-common.sh /entrypoint.sh && chown nextjs:nodejs /opt/omnidev/entrypoint-common.sh /entrypoint.sh

COPY claude-code-wrapper.sh /usr/local/bin/claude-code-wrapper
RUN chmod 755 /usr/local/bin/claude-code-wrapper && chown nextjs:nodejs /usr/local/bin/claude-code-wrapper

COPY --chown=nextjs:nodejs scripts/ ./scripts/
COPY --chown=nextjs:nodejs src/web/scripts/ ./src/web/scripts/
RUN chmod 755 ./scripts/*.sh ./src/web/scripts/*.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/web/server.js"]
