#!/usr/bin/env bash
# ship.sh — Build desktop, upload release, publish update manifest. One command.
#
# Usage:
#   bash scripts/ship.sh              # auto-detect version from tauri.conf.json
#   bash scripts/ship.sh --skip-build # upload existing artifacts without rebuilding
#
# Prerequisites:
#   - gh CLI authenticated
#   - Rust + Bun + Tauri CLI installed
#   - wrangler CLI for Cloudflare Pages deploy
#   - Signing key at ~/.tauri/companion-v2.key or TAURI_SIGNING_PRIVATE_KEY env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_REPO="nhadaututtheky/companion-release"

# ── Parse flags ──────────────────────────────────────────────────────────────
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

# ── Read version ─────────────────────────────────────────────────────────────
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version)" 2>/dev/null \
  || python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])" 2>/dev/null)

if [[ -z "$VERSION" ]]; then
  echo "ERROR: Could not read version from src-tauri/tauri.conf.json"
  exit 1
fi

TAG="v$VERSION"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║  Companion Ship Pipeline             ║"
echo "  ║  Version: $VERSION                      ║"
echo "  ║  Tag:     $TAG                     ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Validate versions match ──────────────────────────────────────────────────
CARGO_VER=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
if [[ "$VERSION" != "$CARGO_VER" ]]; then
  echo "ERROR: Version mismatch!"
  echo "  tauri.conf.json: $VERSION"
  echo "  Cargo.toml:      $CARGO_VER"
  exit 1
fi

# ── Pre-flight checks ────────────────────────────────────────────────────────
for cmd in gh git; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: $cmd not found"
    exit 1
  fi
done

gh auth status &>/dev/null || { echo "ERROR: gh not authenticated. Run: gh auth login"; exit 1; }

# ── Check for uncommitted changes ────────────────────────────────────────────
if [[ -n "$(git status --porcelain -- src-tauri/ packages/ scripts/ 2>/dev/null)" ]]; then
  echo "WARNING: Uncommitted changes in source directories."
  echo "  Proceeding anyway (only tauri build artifacts matter)."
fi

# ── Step 1: Build ────────────────────────────────────────────────────────────
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
NSIS_DIR="$BUNDLE_DIR/nsis"
MSI_DIR="$BUNDLE_DIR/msi"

if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "==> Step 1/4: Building desktop app..."
  bash "$SCRIPT_DIR/build-desktop.sh"
else
  echo "==> Step 1/4: Skipping build (--skip-build)"
fi

# ── Verify artifacts exist ───────────────────────────────────────────────────
NSIS_EXE="$NSIS_DIR/Companion_${VERSION}_x64-setup.exe"
NSIS_SIG="$NSIS_DIR/Companion_${VERSION}_x64-setup.exe.sig"
NSIS_ZIP="$NSIS_DIR/Companion_${VERSION}_x64-setup.nsis.zip"
NSIS_ZIP_SIG="$NSIS_DIR/Companion_${VERSION}_x64-setup.nsis.zip.sig"
MSI_FILE="$MSI_DIR/Companion_${VERSION}_x64_en-US.msi"
MSI_SIG="$MSI_DIR/Companion_${VERSION}_x64_en-US.msi.sig"
MSI_ZIP="$MSI_DIR/Companion_${VERSION}_x64_en-US.msi.zip"
MSI_ZIP_SIG="$MSI_DIR/Companion_${VERSION}_x64_en-US.msi.zip.sig"

for f in "$NSIS_EXE" "$NSIS_SIG" "$MSI_FILE" "$MSI_SIG"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: Missing artifact: $f"
    exit 1
  fi
done

echo "==> All artifacts verified."

# ── Step 2: Create tag ───────────────────────────────────────────────────────
echo "==> Step 2/4: Creating git tag $TAG..."

if git rev-parse "$TAG" &>/dev/null; then
  echo "  Tag $TAG already exists — skipping tag creation."
else
  git tag "$TAG"
  git push origin "$TAG"
  echo "  Tag $TAG pushed."
fi

# ── Step 3: Upload release ───────────────────────────────────────────────────
echo "==> Step 3/4: Uploading release to $RELEASE_REPO..."

# Check if release already exists
if gh release view "$TAG" --repo "$RELEASE_REPO" &>/dev/null; then
  echo "  Release $TAG exists — uploading assets to existing release..."
  gh release upload "$TAG" \
    "$NSIS_EXE" \
    "$NSIS_SIG" \
    "$NSIS_ZIP" \
    "$NSIS_ZIP_SIG" \
    "$MSI_FILE" \
    "$MSI_SIG" \
    "$MSI_ZIP" \
    "$MSI_ZIP_SIG" \
    --repo "$RELEASE_REPO" \
    --clobber
else
  echo "  Creating release $TAG..."
  gh release create "$TAG" \
    "$NSIS_EXE" \
    "$NSIS_SIG" \
    "$NSIS_ZIP" \
    "$NSIS_ZIP_SIG" \
    "$MSI_FILE" \
    "$MSI_SIG" \
    "$MSI_ZIP" \
    "$MSI_ZIP_SIG" \
    --repo "$RELEASE_REPO" \
    --title "Companion $TAG" \
    --notes "Companion desktop $TAG for Windows x64.

## Downloads
- **Installer (recommended):** Companion_${VERSION}_x64-setup.exe
- **MSI:** Companion_${VERSION}_x64_en-US.msi

## What's new
- Health hardening: 94 new tests, ws-bridge surgery, god file cleanup
- Security hardening: rate limiting, input validation, CORS
- Bug fixes and performance improvements"
fi

echo "  Release uploaded."

# ── Step 4: Publish update manifest ──────────────────────────────────────────
echo "==> Step 4/4: Publishing update manifest..."

UPDATES_DIR="$ROOT_DIR/landing/updates"
mkdir -p "$UPDATES_DIR"

# Read signature content
if [[ -f "$NSIS_SIG" ]]; then
  SIG=$(cat "$NSIS_SIG")
else
  SIG=""
  echo "  WARNING: No signature file found. Update manifest will have empty signature."
fi

PUB_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$UPDATES_DIR/windows-x86_64.json" <<MANIFEST
{
  "version": "${VERSION}",
  "url": "https://github.com/${RELEASE_REPO}/releases/download/${TAG}/Companion_${VERSION}_x64-setup.exe",
  "signature": "${SIG}",
  "notes": "Update to v${VERSION}",
  "pub_date": "${PUB_DATE}"
}
MANIFEST

echo "  Generated: windows-x86_64.json"

# Deploy landing to Cloudflare Pages
if command -v wrangler &>/dev/null; then
  wrangler pages deploy "$ROOT_DIR/landing" --project-name companion-landing --commit-dirty=true
  echo "  Landing page deployed."
else
  echo "  WARNING: wrangler not found — skipping Cloudflare Pages deploy."
  echo "  Run manually: wrangler pages deploy landing --project-name companion-landing"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║  Ship complete! v${VERSION}             ║"
echo "  ╠══════════════════════════════════════╣"
echo "  ║  Release: github.com/${RELEASE_REPO}/releases/tag/${TAG}"
echo "  ║  Update:  companion.theio.vn/updates/windows-x86_64.json"
echo "  ╚══════════════════════════════════════╝"
echo ""
