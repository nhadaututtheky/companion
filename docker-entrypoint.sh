#!/bin/bash
set -e

SENTINEL="/app/data/.companion-bootstrapped"
CLAUDE_HOME="/home/companion"

# ── Pre-create config files ─────────────────────────────────────────────────
# Docker bind-mount creates directories instead of files for non-existent paths.
# Pre-create essential files to prevent this.

mkdir -p "$CLAUDE_HOME/.claude"

if [ ! -f "$CLAUDE_HOME/.claude.json" ]; then
  echo '{"hasCompletedOnboarding":true,"installMethod":"native"}' > "$CLAUDE_HOME/.claude.json"
  echo "[startup] Pre-created $CLAUDE_HOME/.claude.json"
fi

if [ ! -f "$CLAUDE_HOME/.claude/settings.json" ]; then
  echo '{}' > "$CLAUDE_HOME/.claude/settings.json"
  echo "[startup] Pre-created $CLAUDE_HOME/.claude/settings.json"
fi

# ── Bootstrap (first run only) ──────────────────────────────────────────────
# Sentinel file prevents re-initialization on container restart,
# protecting user customizations (settings, CLAUDE.md, etc.)

if [ ! -f "$SENTINEL" ]; then
  echo "[startup] First run — bootstrapping..."

  # Restore .claude.json from backup if available
  if ls "$CLAUDE_HOME/.claude/backups/.claude.json.backup."* 1>/dev/null 2>&1; then
    LATEST_BACKUP=$(find "$CLAUDE_HOME/.claude/backups" -name '.claude.json.backup.*' -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_BACKUP" ]; then
      cp "$LATEST_BACKUP" "$CLAUDE_HOME/.claude.json"
      echo "[startup] Restored .claude.json from backup"
    fi
  fi

  # Create sentinel
  date -u > "$SENTINEL"
  echo "[startup] Bootstrap complete"
else
  echo "[startup] Already bootstrapped, skipping init"
fi

# ── Fix permissions ─────────────────────────────────────────────────────────

if ! chown -R companion:companion /app/data 2>/dev/null; then
  echo "[startup] ⚠ Could not chown /app/data — database writes may fail"
fi
if ! chown -R companion:companion "$CLAUDE_HOME/.claude" 2>/dev/null; then
  echo "[startup] ⚠ Could not chown $CLAUDE_HOME/.claude — Claude CLI auth may fail"
fi
if [ -f "$CLAUDE_HOME/.claude.json" ]; then
  chown companion:companion "$CLAUDE_HOME/.claude.json" 2>/dev/null || \
    echo "[startup] ⚠ Could not chown $CLAUDE_HOME/.claude.json"
fi

# ── Start services ──────────────────────────────────────────────────────────
# Run server and web in parallel. If either exits, the container stops.

echo "[startup] Starting Companion server + web..."

su -s /bin/bash companion -c "HOME=$CLAUDE_HOME bun run --hot packages/server/src/index.ts" &
SERVER_PID=$!

su -s /bin/bash companion -c "HOME=$CLAUDE_HOME cd packages/web && bunx next start --port 3580" &
WEB_PID=$!

# Wait for either process to exit — then stop the other.
# Using bash wait -n (requires bash 4.3+, available in Debian Bookworm).
wait -n "$SERVER_PID" "$WEB_PID"
EXIT_CODE=$?

echo "[startup] A process exited (code=$EXIT_CODE), stopping container..."

# Kill remaining process
kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
wait 2>/dev/null || true

exit "$EXIT_CODE"
