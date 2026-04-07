---
name: tauri-desktop-build
description: Build and release Tauri v2 desktop apps via GitHub Actions. Use when setting up Tauri CI/CD, debugging desktop build failures, generating icons, configuring tauri.conf.json v2 schema, creating GitHub releases with direct download links, or setting up auto-update signing.
---

# Tauri v2 Desktop Build — CI/CD Skill

End-to-end reference for building Tauri v2 desktop apps in GitHub Actions with auto-release and auto-update.

---

## Quick Checklist

Before pushing a tag to trigger a desktop build:

- [ ] `src-tauri/icons/` has ALL required files (see Icon Requirements)
- [ ] `tauri.conf.json` validates against v2 schema (see Schema Gotchas)
- [ ] `Cargo.toml` version matches `tauri.conf.json` version
- [ ] Sidecar uses FLAT name (no subdirectory) in `externalBin`, `main.rs`, capabilities
- [ ] Plugin config: only add keys for plugins that require config (omit others)
- [ ] CSP: either `null` or explicitly allows `http://localhost:<port>` for all directives
- [ ] NSIS config uses only v2-valid keys (see NSIS section)
- [ ] `"createUpdaterArtifacts": true` in `bundle` config (see Auto-Update section)
- [ ] Signing keys set as CI secrets (see Auto-Update section)

---

## Icon Requirements

Tauri v2 requires these icon files. Build FAILS with `failed to open icon` if missing.

| File | Size | Format | Purpose |
|------|------|--------|---------|
| `32x32.png` | 32x32 | PNG RGBA | Small app icon |
| `128x128.png` | 128x128 | PNG RGBA | Standard app icon |
| `128x128@2x.png` | 256x256 | PNG RGBA | Retina/HiDPI icon |
| `icon.icns` | multi-size | ICNS | macOS app icon |
| `icon.ico` | multi-size | ICO | Windows app icon |
| `tray-icon.png` | 22x22 | PNG | System tray (macOS template) |

Optional NSIS: `installer.ico` (multi-size ICO), `installer-header.bmp` (150x57 BMP24), `installer-sidebar.bmp` (164x314 BMP24)

Generate with `cargo tauri icon source-1024.png` or programmatic script (`bun run scripts/generate-icons.ts`).

---

## tauri.conf.json v2 Schema Gotchas

### Removed/Renamed Keys (v1 vs v2)

| v1 Key | v2 | Notes |
|--------|----|-------|
| `fileDropEnabled` | `dragDropEnabled` | Window config |
| `bundle.windows.msi` | REMOVED | Not in v2 |
| `nsis.displayInstallMode` | REMOVED | Not in v2 |
| `nsis.enabledLanguages` | REMOVED | Not in v2 |
| `nsis.shortcuts` | REMOVED | Not in v2 |
| `updater` (top-level) | `plugins.updater` | Moved |

### Valid v2 NSIS keys only

`installerIcon`, `headerImage`, `sidebarImage`, `installMode`, `languages`, `displayLanguageSelector`, `template`, `compression`

---

## Auto-Update Signing (CRITICAL)

### The Problem
Tauri v2 auto-updater requires signed bundles. Without proper config, builds succeed but produce NO `.sig` files → auto-update silently broken.

### Setup (one-time)

**Step 1: Generate key pair**
```bash
# --ci flag skips password prompt (generates without password)
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" cargo tauri signer generate -w ~/.tauri/myapp.key --ci
```
- Outputs **private key** file (base64-encoded, multi-line with `untrusted comment:` header)
- Outputs **public key** `.pub` file (also base64-encoded with `untrusted comment:` header)
- Without `--ci`, asks for password interactively

**Step 2: Configure tauri.conf.json**

TWO things required:

```jsonc
{
  "plugins": {
    "updater": {
      "pubkey": "<FULL BASE64 CONTENT of .pub file>",  // ← entire file content, NOT just the key line
      "endpoints": ["https://yoursite.com/updates/{{target}}.json"],
      "active": true
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true,  // ← WITHOUT THIS, NO .sig FILES ARE CREATED
    "targets": "all",
    // ...
  }
}
```

> **CRITICAL pubkey format:** The `pubkey` field must be the **full base64 content** of the `.pub` file (which when decoded contains 2 lines: `untrusted comment:` + actual key). Using just the raw key line (e.g. `RWQb...`) causes `failed to decode pubkey: invalid utf-8` at build time.

> **`createUpdaterArtifacts: true` is the #2 gotcha.** The updater plugin config alone is NOT enough. You MUST also set this in `bundle`. Without it, Tauri builds successfully but creates zero `.sig` files.

**Step 3: CI secrets** (on the repo that runs the build)

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Full base64 content of private key file (includes `untrusted comment:` header when decoded) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password from step 1 (empty string if `--ci` was used) |

**Step 4: CI workflow env**

```yaml
# APPIMAGE_EXTRACT_AND_RUN MUST be at job-level env (not step-level)
# so linuxdeploy child processes inherit it
env:
  APPIMAGE_EXTRACT_AND_RUN: "1"

jobs:
  build:
    steps:
      - name: Build Tauri app
        env:
          NO_STRIP: "true"
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        run: cd src-tauri && cargo tauri build
```

### Update Manifest Format

Tauri updater fetches `{{target}}.json` from endpoints. Target names: `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`.

```json
{
  "version": "0.8.1",
  "url": "https://github.com/USER/REPO/releases/download/v0.8.1/App_0.8.1_x64-setup.exe",
  "signature": "<content of .sig file>",
  "notes": "## What's New\n\n- Feature A\n- Fix B",
  "pub_date": "2026-04-04T12:00:00Z"
}
```

> **Signature field**: Copy the content of the `.sig` file uploaded to the release. If empty `""`, auto-update will fail silently on the client side.

### Updating Manifests After Build

After CI uploads `.sig` files to the release:

```bash
# Download sig files from release
gh release download v0.8.1 --repo USER/REPO --pattern "*.sig" --dir /tmp/sigs

# Read signature content and update manifest
SIG=$(cat /tmp/sigs/App_0.8.1_x64-setup.exe.sig)
# Update the JSON file with the signature value
```

### Debugging Signing Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No `.sig` files in bundle output | Missing `createUpdaterArtifacts: true` | Add to `bundle` in tauri.conf.json |
| Secrets show as empty in CI log | Secrets not set on correct repo | Check repo Settings → Secrets → Actions |
| Secrets show `***` but still no `.sig` | `createUpdaterArtifacts` missing | Config issue, not secrets issue |
| `.sig` files exist but not uploaded | CI `find` pattern doesn't match | Add `-name "*.sig"` to find command |
| Auto-update fails on client | Empty `signature` in manifest JSON | Fill with actual `.sig` file content |
| Key mismatch error | pubkey in config ≠ private key used to sign | Regenerate pair, update both config and secrets |
| `failed to decode pubkey: invalid utf-8` | pubkey is raw key line (`RWQ...`) instead of full base64 | Use full content of `.pub` file as pubkey value |

### Private Key Location

Default locations to check:
```
~/.tauri/myapp.key
src-tauri/.tauri-updater-key      ← gitignored by default
~/myapp.key
```

The `.pub` counterpart should match `plugins.updater.pubkey` in tauri.conf.json.

---

## Split-Repo CI (Free Builds for Private Source)

### The Problem
GitHub Actions on private repos costs money. Public repos get free minutes.

### Architecture
```
companion (private)     →  companion-release (public)
  Source code                CI workflows + releases
  Tags pushed here           Builds triggered via gh CLI
```

### Setup

1. **Public repo** (`companion-release`): contains only `.github/workflows/tauri-build.yml`
2. **PAT (Fine-grained)**: created on private repo, granted to public repo
   - `SOURCE_REPO_TOKEN` secret on public repo — reads private source code (needs `Contents: Read`)
   - The PAT also needs `Actions: Read and write` on the public repo to trigger workflows via `gh workflow run`
3. **Workflow** checks out private source by tag:
   ```yaml
   - uses: actions/checkout@v4
     with:
       repository: USER/private-repo
       token: ${{ secrets.SOURCE_REPO_TOKEN }}
       ref: ${{ inputs.tag }}
   ```

### Triggering Builds

Use `release.bat` (Windows) or `gh` CLI directly:
```bash
gh workflow run tauri-build.yml --repo USER/companion-release --field tag=v0.8.1
```

### release.bat Features
- Pre-flight: checks `gh`, `git`, auth status
- Version parsing: PowerShell `ConvertFrom-Json` (not fragile `findstr`)
- Validates `tauri.conf.json` and `Cargo.toml` versions match
- Warns on uncommitted changes
- Checks tag doesn't already exist
- Creates + pushes tag (rolls back on push failure)
- Triggers build on public repo
- Error handling on every step

### Moving a Tag (when you need to rebuild same version)
```bash
git tag -d v0.8.1
git tag v0.8.1
git push origin v0.8.1 --force
```

---

## GitHub Actions — Required Steps

```yaml
# 1-3: Checkout, setup Bun, install JS deps
# 4: Linux only — apt install: libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev libfuse2
# 5: Rust: dtolnay/rust-toolchain@stable
# 6: Cache: Swatinem/rust-cache@v2, workspaces: "./src-tauri -> target"
# 7: CRITICAL — tauri-action does NOT auto-install CLI for v2:
- run: cargo install tauri-cli --version "^2" --locked
# 8: Build sidecar if using externalBin
# 9: Build with signing env vars
- env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  run: cd src-tauri && cargo tauri build
```

### Upload Step — Include .sig Files

```yaml
- name: Upload to release
  run: |
    # MUST include *.sig pattern — these are the signing artifacts
    for f in $(find "$BUNDLE_DIR" \( \
      -name "*.msi" -o -name "*.exe" -o -name "*.dmg" \
      -o -name "*.AppImage" -o -name "*.deb" \
      -o -name "*.sig" -o -name "*.minisig" \
    \) 2>/dev/null); do
      gh release upload "$TAG" "$f" --repo "$REPO" --clobber || true
    done
```

### Common CI Errors

| Error | Fix |
|-------|-----|
| `no such command: tauri` | Add `cargo install tauri-cli --version "^2"` step |
| `failed to open icon *.png` | Generate + commit icons to `src-tauri/icons/` |
| `Additional properties not allowed` | Remove v1-only keys from tauri.conf.json |
| `not valid under anyOf` | NSIS config has invalid v1 keys — see valid list above |
| `failed to run linuxdeploy` | Set `APPIMAGE_EXTRACT_AND_RUN: "1"` at **job-level** env (NOT step-level) + install `libfuse2` |
| `failed to decode pubkey` | pubkey must be full base64 of `.pub` file, not just the raw key line |
| Linux AppImage build fails entirely | Known issue on some runners — rely on `.deb` instead, update download redirects |

---

## Runtime Errors (CRITICAL — learned the hard way)

These errors only appear AFTER install, not during build. Config is baked into the binary via `tauri::generate_context!()` — cannot be fixed by copying files, must rebuild.

### 1. Plugin config deserialization panic

```
PluginInitialization("notification", "invalid type: map, expected unit")
```

**Cause:** `"notification": {}` in plugins config. Tauri v2 notification plugin expects NO config (unit type).
**Fix:** Remove the key entirely from `plugins` in tauri.conf.json. Do NOT use `{}`, `true`, or `null`.

**Rule:** Only add plugin config keys if the plugin explicitly requires configuration. When in doubt, omit.

### 2. Sidecar "file not found" — NSIS flattens directories

```
Failed to spawn sidecar: The system cannot find the file specified. (os error 2)
```

**Cause:** `externalBin: ["binaries/bun-server"]` — NSIS strips subdirectories, but Tauri runtime still looks for the subdirectory path.

**Fix:** Use flat name WITHOUT subdirectory prefix:

```jsonc
// WRONG — NSIS flattens this, runtime can't find it
"externalBin": ["binaries/bun-server"]

// CORRECT — matches what NSIS actually installs
"externalBin": ["bun-server"]
```

Update ALL references: `tauri.conf.json`, `main.rs`, `capabilities/default.json`, CI workflow.

### 3. White screen — CSP blocks localhost content

**Cause:** CSP `default-src 'self'` blocks `http://localhost:3579`.
**Fix:** Either `"csp": null` or explicitly allow all localhost origins in every directive.

### 4. Static files not served on Windows — path separator mismatch

**Cause:** Path traversal guard uses `/` but `path.resolve()` returns `\` on Windows.
**Fix:** Use `process.platform === "win32" ? "\\" : "/"` for separator.

### Debug tip: config is baked into binary

`tauri::generate_context!()` embeds `tauri.conf.json` at compile time. You CANNOT fix config issues by editing files after install — must rebuild and reinstall.

---

## Direct Download Links

Upload version-less aliases after build for stable download URLs:

```yaml
# In CI upload step:
DMG=$(find "$BUNDLE_DIR" -name "*.dmg" | head -1)
[ -n "$DMG" ] && cp "$DMG" "Companion_aarch64.dmg" && \
  gh release upload "$TAG" "Companion_aarch64.dmg" --repo "$REPO" --clobber || true

MSI=$(find "$BUNDLE_DIR" -name "*.msi" | head -1)
[ -n "$MSI" ] && cp "$MSI" "Companion_x64-setup.msi" && \
  gh release upload "$TAG" "Companion_x64-setup.msi" --repo "$REPO" --clobber || true
```

Cloudflare Pages `_redirects` for clean URLs:
```
/download/macos   https://github.com/USER/REPO/releases/latest/download/Companion_aarch64.dmg   302
/download/windows https://github.com/USER/REPO/releases/latest/download/Companion_x64-setup.msi 302
/download/linux   https://github.com/USER/REPO/releases/latest/download/Companion_amd64.deb     302
```

> **Linux note:** AppImage builds often fail on GitHub Actions (linuxdeploy issues). Use `.deb` as the primary Linux download format.

---

## Release Flow (Companion-specific)

1. Bump versions in BOTH `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml` (must match)
2. Commit + push to main
3. Create + push tag: `git tag v0.X.Y && git push origin v0.X.Y`
4. Trigger build: `gh workflow run "Tauri Desktop Build" --repo nhadaututtheky/companion-release -f tag=v0.X.Y`
5. CI builds Windows + macOS + Linux (.deb), uploads to GitHub Release with aliases
6. After build: download `.sig` files, update `landing/updates/*.json` manifests with signatures
7. Deploy landing: `wrangler pages deploy landing --project-name companion-landing`
8. Download links auto-resolve via `/releases/latest/download/`

> **IMPORTANT:** CI checks out by tag (`ref: ${{ inputs.tag }}`), so the tag MUST point to the commit with your changes. If you fix something after tagging, create a new tag — don't reuse the old one.

### Version Bump Locations
- `src-tauri/tauri.conf.json` → `version` field
- `src-tauri/Cargo.toml` → `version` field
- All `packages/*/package.json` → `version` field
- `landing/updates/*.json` → `version`, `url`, `signature`, `pub_date` fields
- `landing/index.html` → hero badge + desktop download note
- `landing/install.sh` + `landing/install.ps1` → installer version
