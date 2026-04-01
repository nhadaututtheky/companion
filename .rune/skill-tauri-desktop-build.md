---
name: tauri-desktop-build
description: Build and release Tauri v2 desktop apps via GitHub Actions. Use when setting up Tauri CI/CD, debugging desktop build failures, generating icons, configuring tauri.conf.json v2 schema, or creating GitHub releases with direct download links.
---

# Tauri v2 Desktop Build — CI/CD Skill

End-to-end reference for building Tauri v2 desktop apps in GitHub Actions with auto-release.

---

## Quick Checklist

Before pushing a tag to trigger a desktop build:

- [ ] `src-tauri/icons/` has ALL required files (see Icon Requirements)
- [ ] `tauri.conf.json` validates against v2 schema (see Schema Gotchas)
- [ ] `Cargo.toml` version matches `tauri.conf.json` version
- [ ] Rust sidecar/binary paths are correct in `bundle.externalBin`
- [ ] NSIS config uses only v2-valid keys (see NSIS section)

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

## GitHub Actions — Required Steps

```yaml
# 1-3: Checkout, setup Bun, install JS deps
# 4: Linux only — apt install: libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev
# 5: Rust: dtolnay/rust-toolchain@stable
# 6: Cache: Swatinem/rust-cache@v2, workspaces: "./src-tauri -> target"
# 7: CRITICAL — tauri-action does NOT auto-install CLI for v2:
- run: cargo install tauri-cli --version "^2" --locked
# 8: Build sidecar if using externalBin
# 9: tauri-apps/tauri-action@v0 with tauriScript: cargo tauri, releaseDraft: true
```

### Common CI Errors

| Error | Fix |
|-------|-----|
| `no such command: tauri` | Add `cargo install tauri-cli --version "^2"` step |
| `failed to open icon *.png` | Generate + commit icons to `src-tauri/icons/` |
| `Additional properties not allowed` | Remove v1-only keys from tauri.conf.json |
| `not valid under anyOf` | NSIS config has invalid v1 keys — see valid list above |

---

## Direct Download Links

Upload version-less aliases after build:

```yaml
- name: Upload download aliases
  run: |
    TAG="${{ github.ref_name }}"
    BUNDLE="src-tauri/target/release/bundle"
    for ext in dmg msi AppImage; do
      FILE=$(find "$BUNDLE" -name "*.$ext" | head -1)
      [ -n "$FILE" ] && cp "$FILE" "App.$ext" && gh release upload "$TAG" "App.$ext" --clobber
    done
```

Cloudflare Pages `_redirects` for clean URLs:
```
/download/macos   https://github.com/USER/REPO/releases/latest/download/App.dmg       302
/download/windows https://github.com/USER/REPO/releases/latest/download/App.msi       302
/download/linux   https://github.com/USER/REPO/releases/latest/download/App.AppImage  302
```

---

## Release Flow

1. Bump versions (package.json, Cargo.toml, tauri.conf.json, constants)
2. Commit + tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. CI builds 3 platforms, creates **draft** GitHub Release
4. Review draft on GitHub → Publish
5. Download links auto-resolve via `/releases/latest/download/`
