# Use pure Ubuntu for full Claude Code compatibility
FROM ubuntu:22.04 AS base

# Install Node.js 18 and essential build tools
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y \
    nodejs \
    python3 \
    make \
    g++ \
    git \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# STAGE 1: Dependencies Installation
# =============================================================================
# Install dependencies only when needed
FROM base AS deps

# Install pnpm package manager
RUN npm install -g pnpm

WORKDIR /app

# Copy package.json, pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# STAGE 2: Build Stage
# =============================================================================
# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pnpm in builder stage
RUN npm install -g pnpm

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN pnpm run build

# =============================================================================
# STAGE 3: Production Runtime
# =============================================================================
# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

# Install pnpm and Claude Code in the runtime image
RUN npm install -g pnpm @anthropic-ai/claude-code@latest

# Create system user and group for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create workspaces directory with proper permissions
RUN mkdir -p workspaces && chown nextjs:nodejs workspaces

# Create secrets directory at root level with proper permissions
RUN mkdir -p /secrets && chown nextjs:nodejs /secrets

# Copy the entrypoint script and set proper permissions (after users are created)
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh && chown nextjs:nodejs /entrypoint.sh

# Switch to non-root user for security
USER nextjs

# Expose the application port
EXPOSE 3000

# Set environment variables for the application
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Start the application
CMD ["node", "server.js"]