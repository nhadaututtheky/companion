#!/usr/bin/env bash
# publish-update.sh — Generate Tauri update manifests and deploy to Cloudflare Pages
#
# Usage: bash scripts/publish-update.sh <version>
# Example: bash scripts/publish-update.sh 0.7.1

set -euo pipefail

VERSION="${1:?Usage: publish-update.sh <version>}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPDATES_DIR="$ROOT_DIR/landing/updates"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"

mkdir -p "$UPDATES_DIR"

# ── Generate Windows manifest ─────────────────────────────────────────────────
NSIS_SIG="$BUNDLE_DIR/nsis/Companion_${VERSION}_x64-setup.exe.minisig"
if [[ ! -f "$NSIS_SIG" ]]; then
    echo "ERROR: Signature not found: $NSIS_SIG"
    echo "Run the build with TAURI_SIGNING_PRIVATE_KEY set, then sign with minisign."
    exit 1
fi

SIG_CONTENT=$(cat "$NSIS_SIG" | tr '\n' '\\n' | sed 's/\\n$//')

cat > "$UPDATES_DIR/windows-x86_64.json" <<MANIFEST
{
  "version": "${VERSION}",
  "url": "https://github.com/nhadaututtheky/companion-release/releases/download/v${VERSION}/Companion_${VERSION}_x64-setup.exe",
  "signature": "$(cat "$NSIS_SIG")",
  "notes": "Update to v${VERSION}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST

echo "Generated: $UPDATES_DIR/windows-x86_64.json"

# ── Deploy landing to Cloudflare Pages ────────────────────────────────────────
echo "Deploying to Cloudflare Pages..."
wrangler pages deploy "$ROOT_DIR/landing" --project-name companion-landing --commit-dirty=true

echo ""
echo "==> Update manifest published for v${VERSION}"
echo "    Endpoint: https://companion.theio.vn/updates/windows-x86_64.json"
