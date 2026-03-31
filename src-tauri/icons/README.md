# Icons

Tauri requires the following icon files before the app can be bundled.
Generate them from a master 1024×1024 PNG (e.g. `icon-master.png`) using:

```bash
# Requires ImageMagick
convert icon-master.png -resize 32x32   32x32.png
convert icon-master.png -resize 128x128 128x128.png
convert icon-master.png -resize 256x256 128x128@2x.png

# macOS .icns (requires iconutil on macOS)
mkdir icon.iconset
cp 128x128.png icon.iconset/icon_128x128.png
# ... (add all sizes per Apple spec)
iconutil -c icns icon.iconset -o icon.icns

# Windows .ico (ImageMagick)
convert icon-master.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Tray icon (22x22 on macOS, 16x16 on Windows)
convert icon-master.png -resize 22x22 tray-icon.png
```

Or use the official Tauri CLI helper:
```bash
cargo tauri icon icon-master.png
```
This auto-generates all required sizes in one command.

## Required files (checked by Tauri bundler)
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns`  (macOS)
- `icon.ico`   (Windows)
- `tray-icon.png` (system tray)
