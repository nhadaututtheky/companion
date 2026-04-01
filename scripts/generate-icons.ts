/**
 * generate-icons.ts
 * Converts companion-icon.svg → all Tauri icon formats using sharp.
 *
 * Run: bun run scripts/generate-icons.ts
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SVG_PATH = join(__dirname, "../src-tauri/icons/companion-icon.svg");
const ICONS_DIR = join(__dirname, "../src-tauri/icons");

mkdirSync(ICONS_DIR, { recursive: true });

const svgBuffer = readFileSync(SVG_PATH);

async function generatePng(size: number, name: string): Promise<void> {
  await sharp(svgBuffer, { density: Math.round((size / 1024) * 72 * 8) })
    .resize(size, size)
    .png()
    .toFile(join(ICONS_DIR, name));
  console.log(`  ✓ ${name} (${size}x${size})`);
}

async function generatePngBuffer(size: number): Promise<Buffer> {
  return sharp(svgBuffer, { density: Math.round((size / 1024) * 72 * 8) })
    .resize(size, size)
    .png()
    .toBuffer();
}

function buildIco(pngBuffers: Buffer[], sizes: number[]): Buffer {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;

  let offset = headerSize + dirEntrySize * numImages;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(numImages, 4);

  const entries: Buffer[] = [];
  for (let i = 0; i < numImages; i++) {
    const entry = Buffer.alloc(dirEntrySize);
    const s = sizes[i] >= 256 ? 0 : sizes[i];
    entry.writeUInt8(s, 0);
    entry.writeUInt8(s, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngBuffers[i].length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

// ICNS type codes → pixel sizes
const ICNS_TYPES: [string, number][] = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
];

function buildIcns(pngBuffers: Map<number, Buffer>): Buffer {
  const chunks: Buffer[] = [];

  for (const [type, size] of ICNS_TYPES) {
    const png = pngBuffers.get(size);
    if (!png) continue;
    const chunk = Buffer.alloc(8 + png.length);
    chunk.write(type, 0, 4, "ascii");
    chunk.writeUInt32BE(8 + png.length, 4);
    png.copy(chunk, 8);
    chunks.push(chunk);
  }

  const totalData = chunks.reduce((s, c) => s + c.length, 0);
  const icns = Buffer.alloc(8 + totalData);
  icns.write("icns", 0, 4, "ascii");
  icns.writeUInt32BE(8 + totalData, 4);

  let pos = 8;
  for (const chunk of chunks) {
    chunk.copy(icns, pos);
    pos += chunk.length;
  }

  return icns;
}

async function generateBmp(
  width: number,
  height: number,
  name: string
): Promise<void> {
  // Render SVG to raw RGB pixels, then write BMP manually
  const raw = await sharp(svgBuffer, {
    density: Math.round((Math.max(width, height) / 1024) * 72 * 8),
  })
    .resize(width, height, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // BMP 24-bit
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER
  bmp.write("BM", 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(-height, 22); // top-down
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = 54 + y * rowSize + x * 3;
      bmp[dstIdx + 0] = raw[srcIdx + 2]; // B
      bmp[dstIdx + 1] = raw[srcIdx + 1]; // G
      bmp[dstIdx + 2] = raw[srcIdx + 0]; // R
    }
  }

  writeFileSync(join(ICONS_DIR, name), bmp);
  console.log(`  ✓ ${name} (${width}x${height})`);
}

async function main() {
  console.log("Generating Companion icons from companion-icon.svg...\n");

  // PNG icons for Tauri
  await generatePng(32, "32x32.png");
  await generatePng(128, "128x128.png");
  await generatePng(256, "128x128@2x.png");

  // Tray icon (small, template-friendly)
  await generatePng(22, "tray-icon.png");

  // ICO (Windows)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(icoSizes.map((s) => generatePngBuffer(s)));
  const ico = buildIco(icoBuffers, icoSizes);
  writeFileSync(join(ICONS_DIR, "icon.ico"), ico);
  console.log(`  ✓ icon.ico (${icoSizes.join(",")}px)`);

  // Installer ICO
  const instSizes = [16, 32, 48, 256];
  const instBuffers = await Promise.all(instSizes.map((s) => generatePngBuffer(s)));
  const instIco = buildIco(instBuffers, instSizes);
  writeFileSync(join(ICONS_DIR, "installer.ico"), instIco);
  console.log(`  ✓ installer.ico (${instSizes.join(",")}px)`);

  // ICNS (macOS)
  const icnsSizes = [16, 32, 64, 128, 256, 512, 1024];
  const icnsPngMap = new Map<number, Buffer>();
  await Promise.all(
    icnsSizes.map(async (s) => {
      icnsPngMap.set(s, await generatePngBuffer(s));
    })
  );
  const icns = buildIcns(icnsPngMap);
  writeFileSync(join(ICONS_DIR, "icon.icns"), icns);
  console.log(`  ✓ icon.icns (${icnsSizes.join(",")}px)`);

  // NSIS BMP files
  await generateBmp(150, 57, "installer-header.bmp");
  await generateBmp(164, 314, "installer-sidebar.bmp");

  console.log(`\n✓ All icons generated from SVG → ${ICONS_DIR}`);
}

main().catch(console.error);
