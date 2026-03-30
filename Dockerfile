# ── Stage 1: Build web (Next.js) ──────────────────────────────────────────────
FROM oven/bun:1.3 AS web-builder

WORKDIR /app

# Copy all source + package files
COPY package.json bun.lock tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/ packages/web/
COPY packages/server/ packages/server/

# Install deps + build in one stage
RUN bun install --frozen-lockfile
WORKDIR /app/packages/web
RUN bunx next build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runtime

WORKDIR /app

# Install Node.js + Claude CLI + tini (proper PID 1 for signal forwarding)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    curl \
    git \
    tini \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

# Copy source + deps from builder (reuse node_modules)
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/package.json ./
COPY --from=web-builder /app/bun.lock ./
COPY --from=web-builder /app/tsconfig.json ./
COPY --from=web-builder /app/packages/shared/ ./packages/shared/

# Copy server source + deps
COPY packages/server/ packages/server/
COPY --from=web-builder /app/packages/server/node_modules packages/server/node_modules

# Copy web config + built output
COPY packages/web/package.json packages/web/
COPY packages/web/next.config.ts packages/web/
COPY packages/web/tsconfig.json packages/web/
COPY packages/web/postcss.config.mjs packages/web/
COPY --from=web-builder /app/packages/web/.next packages/web/.next
COPY --from=web-builder /app/packages/web/node_modules packages/web/node_modules

# Create non-root user for security with a proper home directory
RUN groupadd --system companion && \
    useradd --system --gid companion --home /home/companion --create-home companion

# Create data directory
RUN mkdir -p data

EXPOSE 3579 3580

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3579/api/health || exit 1

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Use tini as PID 1 for proper signal forwarding and zombie reaping
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
