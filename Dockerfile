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

# Install Node.js + Claude CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    curl \
    git \
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

# Create non-root user for security (groupadd/useradd for Debian-slim)
RUN groupadd --system companion && useradd --system --gid companion --home /app companion

# Create data directory with correct ownership (only writable dirs, not all of /app)
RUN mkdir -p data && chown -R companion:companion data

EXPOSE 3579 3580

# Run as non-root user
USER companion

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3579/api/health || exit 1

CMD ["sh", "-c", "bun run --hot packages/server/src/index.ts & cd packages/web && bunx next start --port 3580 & wait"]
