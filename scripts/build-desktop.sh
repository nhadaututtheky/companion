#!/usr/bin/env bash
# build-desktop.sh — Build the Companion desktop app (Tauri 2)
#
# Prerequisites:
#   - Rust toolchain (https://rustup.rs)
#   - Bun  (https://bun.sh)
#   - Tauri CLI: cargo install tauri-cli --version "^2"
#   - Platform libs: see https://tauri.app/v2/guides/getting-started/prerequisites
#
# Usage:
#   bash scripts/build-desktop.sh          # production build
#   bash scripts/build-desktop.sh --debug  # debug build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$ROOT_DIR/packages/web"
TAURI_DIR="$ROOT_DIR/src-tauri"

BUILD_MODE="release"
CARGO_FLAGS=""

if [[ "${1:-}" == "--debug" ]]; then
    BUILD_MODE="debug"
    CARGO_FLAGS="--debug"
fi

echo "==> Building Companion desktop ($BUILD_MODE)"

# ── 0. Resolve signing key ────────────────────────────────────────────────────
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    KEY_FILE="$HOME/.tauri/companion.key"
    ENV_TAURI="$ROOT_DIR/.env.tauri"

    if [[ -f "$KEY_FILE" ]]; then
        echo "==> Loading signing key from $KEY_FILE"
        export TAURI_SIGNING_PRIVATE_KEY
        # Must preserve newlines — Tauri expects the full 2-line rsign format
        TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
    elif [[ -f "$ENV_TAURI" ]]; then
        echo "==> Loading signing key from .env.tauri"
        # shellcheck disable=SC1090
        source "$ENV_TAURI"
        export TAURI_SIGNING_PRIVATE_KEY
    else
        echo ""
        echo "WARNING: No signing key found. Updater artifacts will NOT be signed."
        echo "  Fix: cargo tauri signer generate -w ~/.tauri/companion.key"
        echo "  Or:  Create .env.tauri with TAURI_SIGNING_PRIVATE_KEY=<key>"
        echo ""
    fi
else
    echo "==> Signing key found in environment"
fi

# ── 1. Install JS dependencies ────────────────────────────────────────────────
echo "==> Installing dependencies..."
cd "$ROOT_DIR"
bun install --frozen-lockfile

# ── 2. Build Next.js as a static export ──────────────────────────────────────
echo "==> Building Next.js static export..."
cd "$WEB_DIR"
bun run build
cd "$ROOT_DIR"

# ── 3. Package the Bun server binary as a sidecar ────────────────────────────
echo "==> Bundling Bun server sidecar..."
SIDECAR_DIR="$TAURI_DIR/binaries"
mkdir -p "$SIDECAR_DIR"

# Detect target triple (needed for Tauri sidecar naming convention)
TARGET_TRIPLE=$(rustc -Vv 2>/dev/null | grep '^host:' | awk '{print $2}')
if [[ -z "$TARGET_TRIPLE" ]]; then
    echo "ERROR: Could not detect Rust target triple. Is Rust installed?"
    exit 1
fi

SIDECAR_NAME="bun-server-$TARGET_TRIPLE"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    SIDECAR_NAME="$SIDECAR_NAME.exe"
fi

echo "  Target triple : $TARGET_TRIPLE"
echo "  Sidecar binary: $SIDECAR_DIR/$SIDECAR_NAME"

# Compile the server entry point into a standalone binary using `bun build`
cd "$ROOT_DIR"
bun build packages/server/src/index.ts \
    --compile \
    --target bun \
    --outfile "$SIDECAR_DIR/$SIDECAR_NAME"

# ── 4. Copy web static export into Tauri resource dir ─────────────────────────
# Tauri bundles "resources" entries into $INSTDIR alongside the sidecar.
# The sidecar receives the resolved path via WEB_PATH env var from main.rs.
echo "==> Copying web UI into Tauri resources..."
rm -rf "$TAURI_DIR/web"
cp -r "$WEB_DIR/out" "$TAURI_DIR/web"

# ── 5. Build the Tauri app ────────────────────────────────────────────────────
echo "==> Building Tauri app..."
cd "$TAURI_DIR"
cargo tauri build $CARGO_FLAGS

echo ""
echo "==> Build complete!"
echo "    Artifacts are in: $TAURI_DIR/target/$BUILD_MODE/bundle/"
