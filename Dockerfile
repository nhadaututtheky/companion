# ── Stage 1: Install dependencies ──────────────────────────────────────────────
FROM oven/bun:1.3 AS deps

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# Install all dependencies
RUN bun install --frozen-lockfile

# ── Stage 2: Build web (Next.js) ──────────────────────────────────────────────
FROM oven/bun:1.3 AS web-builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package.json bun.lock tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

WORKDIR /app/packages/web
RUN bun run build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runtime

WORKDIR /app

# Install Node.js (needed to spawn Claude CLI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy source
COPY package.json bun.lock tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/web/package.json packages/web/package.json
COPY packages/web/next.config.ts packages/web/next.config.ts
COPY packages/web/tsconfig.json packages/web/tsconfig.json
COPY packages/web/postcss.config.mjs packages/web/postcss.config.mjs
COPY packages/web/public/ packages/web/public/

# Copy built Next.js output
COPY --from=web-builder /app/packages/web/.next packages/web/.next

# Create data directory for SQLite
RUN mkdir -p data

# Expose ports
EXPOSE 3579 3580

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3579/api/health || exit 1

# Start both server and web
CMD ["sh", "-c", "bun run --hot packages/server/src/index.ts & bun --cwd packages/web run start & wait"]
