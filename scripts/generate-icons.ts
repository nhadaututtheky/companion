/**
 * generate-icons.ts
 * Creates placeholder icon files for the Tauri v2 Companion desktop app.
 *
 * Brand: #4285F4 (Google Blue) with white "C" letter
 *
 * Run: bun run scripts/generate-icons.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "../src-tauri/icons");

mkdirSync(ICONS_DIR, { recursive: true });

const out = (name: string) => join(ICONS_DIR, name);

// ---------------------------------------------------------------------------
// PNG encoder — pure TypeScript, no deps
// ---------------------------------------------------------------------------

// Brand colors
const BRAND_BLUE = [0x42, 0x85, 0xf4, 0xff] as const; // #4285F4
const WHITE = [0xff, 0xff, 0xff, 0xff] as const;
const TRANSPARENT = [0x00, 0x00, 0x00, 0x00] as const;

type RGBA = readonly [number, number, number, number];

/**
 * Renders a simple "C" letterform as a pixel mask at scale relative to size.
 * Returns true if the pixel at (x, y) inside a [size x size] canvas is part of
 * the white "C" glyph.
 */
function isCPixel(px: number, py: number, size: number): boolean {
  // Normalize to [-1, 1]
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36; // outer circle radius
  const strokeW = size * 0.14; // stroke width
  const ri = r - strokeW; // inner radius

  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Is the pixel inside the ring (annulus)?
  if (dist > r || dist < ri) return false;

  // Cut the opening on the right side — angle 0 = right, going counter-clockwise
  // Opening: from -45° to +45° (i.e., ±π/4 from 3 o'clock)
  const angle = Math.atan2(dy, dx); // -π to π
  const openingHalf = Math.PI * 0.28; // ~50° half-opening
  if (Math.abs(angle) < openingHalf) return false;

  return true;
}

/**
 * Renders a rounded-rect icon with a "C" letterform on top.
 * Returns raw RGBA pixel data (Uint8Array, row-major).
 */
function renderIcon(size: number, bg: RGBA, fg: RGBA): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);

  const radius = size * 0.22; // corner radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded-rect test
      let inBg = false;
      const lx = Math.min(x, size - 1 - x);
      const ly = Math.min(y, size - 1 - y);
      if (lx >= radius || ly >= radius) {
        inBg = true;
      } else {
        // corner
        const cdx = lx - radius;
        const cdy = ly - radius;
        inBg = Math.sqrt(cdx * cdx + cdy * cdy) <= radius;
      }

      if (!inBg) {
        // transparent outside
        pixels[idx] = TRANSPARENT[0];
        pixels[idx + 1] = TRANSPARENT[1];
        pixels[idx + 2] = TRANSPARENT[2];
        pixels[idx + 3] = TRANSPARENT[3];
        continue;
      }

      if (isCPixel(x, y, size)) {
        pixels[idx] = fg[0];
        pixels[idx + 1] = fg[1];
        pixels[idx + 2] = fg[2];
        pixels[idx + 3] = fg[3];
      } else {
        pixels[idx] = bg[0];
        pixels[idx + 1] = bg[1];
        pixels[idx + 2] = bg[2];
        pixels[idx + 3] = bg[3];
      }
    }
  }

  return pixels;
}

// ---------------------------------------------------------------------------
// CRC-32 table (required for PNG)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array, start = 0, end = data.length): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Adler-32 and zlib deflate (uncompressed — store blocks only)
// ---------------------------------------------------------------------------

function adler32(data: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

/**
 * Wraps raw bytes in a zlib container using DEFLATE "stored" (no compression).
 * This produces valid zlib data that PNG decoders accept.
 */
function zlibStore(data: Uint8Array): Uint8Array {
  // DEFLATE stored block max payload = 65535 bytes
  const MAX_BLOCK = 65535;
  const numBlocks = Math.ceil(data.length / MAX_BLOCK) || 1;

  // Header (2) + per-block overhead (5) + data + adler (4)
  const out = new Uint8Array(2 + numBlocks * 5 + data.length + 4);
  let pos = 0;

  // CMF, FLG — CM=8 deflate, CINFO=7 (32K window), FCHECK computed
  out[pos++] = 0x78;
  out[pos++] = 0x9c;

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1;
    const blockData = data.subarray(offset, offset + MAX_BLOCK);
    const len = blockData.length;
    const nlen = (~len) & 0xffff;

    out[pos++] = isLast ? 0x01 : 0x00; // BFINAL | BTYPE=00 (store)
    out[pos++] = len & 0xff;
    out[pos++] = (len >> 8) & 0xff;
    out[pos++] = nlen & 0xff;
    out[pos++] = (nlen >> 8) & 0xff;
    out.set(blockData, pos);
    pos += len;
    offset += len;
  }

  const adler = adler32(data);
  out[pos++] = (adler >> 24) & 0xff;
  out[pos++] = (adler >> 16) & 0xff;
  out[pos++] = (adler >> 8) & 0xff;
  out[pos++] = adler & 0xff;

  return out.subarray(0, pos);
}

// ---------------------------------------------------------------------------
// PNG writer
// ---------------------------------------------------------------------------

function writePNG(size: number, pixels: Uint8Array): Uint8Array {
  // Filter pixels: prepend filter byte 0 (None) to each row
  const rowBytes = size * 4;
  const filtered = new Uint8Array(size * (1 + rowBytes));
  for (let y = 0; y < size; y++) {
    filtered[y * (1 + rowBytes)] = 0; // filter type None
    filtered.set(
      pixels.subarray(y * rowBytes, (y + 1) * rowBytes),
      y * (1 + rowBytes) + 1
    );
  }

  const compressed = zlibStore(filtered);

  // Build chunks
  function makeChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length, false);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crc = crc32(chunk, 4, 8 + data.length);
    view.setUint32(8 + data.length, crc, false);
    return chunk;
  }

  // IHDR
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, size, false);
  ihdrView.setUint32(4, size, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", compressed);
  const iend = makeChunk("IEND", new Uint8Array(0));

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const total = signature.length + ihdr.length + idat.length + iend.length;
  const result = new Uint8Array(total);
  let pos = 0;
  result.set(signature, pos); pos += signature.length;
  result.set(ihdr, pos);     pos += ihdr.length;
  result.set(idat, pos);     pos += idat.length;
  result.set(iend, pos);
  return result;
}

// ---------------------------------------------------------------------------
// ICO writer (Windows icon — embeds PNG directly, Vista+ format)
// ---------------------------------------------------------------------------

function writeICO(sizes: number[]): Uint8Array {
  // Render each size
  const pngBuffers = sizes.map((s) =>
    writePNG(s, renderIcon(s, BRAND_BLUE, WHITE))
  );

  const headerSize = 6 + 16 * sizes.length;
  let offset = headerSize;
  const offsets: number[] = [];

  for (const buf of pngBuffers) {
    offsets.push(offset);
    offset += buf.length;
  }

  const totalSize = offset;
  const ico = new Uint8Array(totalSize);
  const view = new DataView(ico.buffer);

  // ICONDIR header
  view.setUint16(0, 0, true);             // reserved
  view.setUint16(2, 1, true);             // type: ICO
  view.setUint16(4, sizes.length, true);  // count

  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16;
    const s = sizes[i];
    ico[entry + 0] = s >= 256 ? 0 : s;   // width (0 = 256+)
    ico[entry + 1] = s >= 256 ? 0 : s;   // height
    ico[entry + 2] = 0;                   // color count (0 = truecolor)
    ico[entry + 3] = 0;                   // reserved
    view.setUint16(entry + 4, 1, true);   // planes
    view.setUint16(entry + 6, 32, true);  // bit count
    view.setUint32(entry + 8, pngBuffers[i].length, true);  // size
    view.setUint32(entry + 12, offsets[i], true);            // offset
  }

  let pos = headerSize;
  for (const buf of pngBuffers) {
    ico.set(buf, pos);
    pos += buf.length;
  }

  return ico;
}

// ---------------------------------------------------------------------------
// ICNS writer (macOS — minimal, embeds PNG for common sizes)
// ---------------------------------------------------------------------------

// ICNS type codes → pixel sizes
const ICNS_SIZES: Record<string, number> = {
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024,
};

function writeICNS(): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const [type, size] of Object.entries(ICNS_SIZES)) {
    const pixels = renderIcon(size, BRAND_BLUE, WHITE);
    const png = writePNG(size, pixels);

    const chunk = new Uint8Array(8 + png.length);
    const view = new DataView(chunk.buffer);
    const typeBytes = new TextEncoder().encode(type);
    chunk.set(typeBytes, 0);
    view.setUint32(4, 8 + png.length, false); // big-endian length includes header
    chunk.set(png, 8);
    chunks.push(chunk);
  }

  const totalData = chunks.reduce((s, c) => s + c.length, 0);
  const icns = new Uint8Array(8 + totalData);
  const view = new DataView(icns.buffer);
  icns.set(new TextEncoder().encode("icns"), 0);
  view.setUint32(4, 8 + totalData, false);

  let pos = 8;
  for (const chunk of chunks) {
    icns.set(chunk, pos);
    pos += chunk.length;
  }

  return icns;
}

// ---------------------------------------------------------------------------
// BMP writer (uncompressed 24-bit, no alpha — for NSIS)
// ---------------------------------------------------------------------------

function writeBMP(width: number, height: number, fillColor: RGBA): Uint8Array {
  // Row padding to 4 bytes
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const bmp = new Uint8Array(fileSize);
  const view = new DataView(bmp.buffer);

  // BITMAPFILEHEADER
  bmp[0] = 0x42; bmp[1] = 0x4d; // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);   // reserved1
  view.setUint16(8, 0, true);   // reserved2
  view.setUint32(10, 54, true); // pixel data offset

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);          // header size
  view.setInt32(18, width, true);        // width
  view.setInt32(22, -height, true);      // height (negative = top-down)
  view.setUint16(26, 1, true);           // color planes
  view.setUint16(28, 24, true);          // bits per pixel
  view.setUint32(30, 0, true);           // compression (BI_RGB)
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true);         // X pixels per meter (~72 DPI)
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  // Fill pixel data (BGR order, row-padded)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = 54 + y * rowSize + x * 3;
      bmp[base + 0] = fillColor[2]; // B
      bmp[base + 1] = fillColor[1]; // G
      bmp[base + 2] = fillColor[0]; // R
    }
  }

  return bmp;
}

// ---------------------------------------------------------------------------
// Generate all files
// ---------------------------------------------------------------------------

console.log("Generating Companion icons...");

// PNG icons
const SIZES: Array<[string, number]> = [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
];

for (const [name, size] of SIZES) {
  const pixels = renderIcon(size, BRAND_BLUE, WHITE);
  const png = writePNG(size, pixels);
  writeFileSync(out(name), png);
  console.log(`  ✓ ${name} (${size}x${size})`);
}

// Tray icon — monochrome-friendly (white on transparent for template usage)
{
  const pixels = renderIcon(22, TRANSPARENT, WHITE);
  const png = writePNG(22, pixels);
  writeFileSync(out("tray-icon.png"), png);
  console.log("  ✓ tray-icon.png (22x22, white on transparent)");
}

// ICO files (Windows app icon + installer icon)
{
  const ico = writeICO([16, 32, 48, 64, 128, 256]);
  writeFileSync(out("icon.ico"), ico);
  console.log("  ✓ icon.ico (16,32,48,64,128,256)");
}

{
  const ico = writeICO([16, 32, 48, 256]);
  writeFileSync(out("installer.ico"), ico);
  console.log("  ✓ installer.ico (16,32,48,256)");
}

// ICNS (macOS)
{
  const icns = writeICNS();
  writeFileSync(out("icon.icns"), icns);
  console.log("  ✓ icon.icns (16..1024 PNG chunks)");
}

// BMP files (NSIS installer)
// installer-header.bmp: 150×57, brand blue
{
  const bmp = writeBMP(150, 57, BRAND_BLUE);
  writeFileSync(out("installer-header.bmp"), bmp);
  console.log("  ✓ installer-header.bmp (150x57)");
}

// installer-sidebar.bmp: 164×314, brand blue
{
  const bmp = writeBMP(164, 314, BRAND_BLUE);
  writeFileSync(out("installer-sidebar.bmp"), bmp);
  console.log("  ✓ installer-sidebar.bmp (164x314)");
}

console.log(`\nAll icons written to ${ICONS_DIR}`);
