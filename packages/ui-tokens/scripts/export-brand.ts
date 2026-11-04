import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../../../", import.meta.url);
const path = (name: string) => fileURLToPath(new URL(name, root));
const source = path("packages/ui-tokens/assets/Sydney.icon/Assets/sydney-mark.png");

// The Sydney mark is a glyph on transparency; keep it that way rather than baking a plate.
const square = await sharp(source)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const rounded = square;

async function png(input: Buffer, name: string, size: number) {
  await sharp(input).resize(size, size).png().toFile(path(name));
}

// PNG frames in ICO are supported by modern Windows and browser favicon loaders.
async function ico(input: Buffer, name: string, sizes: number[]) {
  const frames = await Promise.all(sizes.map((size) => sharp(input).resize(size).png().toBuffer()));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await writeFile(path(name), Buffer.concat([header, ...frames]));
}

for (const app of ["web", "www"]) {
  const publicDir = `apps/${app}/public`;
  await png(rounded, `${publicDir}/favicon-16x16.png`, 16);
  await png(rounded, `${publicDir}/favicon-32x32.png`, 32);
  await png(rounded, `${publicDir}/favicon.png`, 128);
  await png(square, `${publicDir}/apple-touch-icon.png`, 180);
  await png(square, `${publicDir}/icon-192.png`, 192);
  await png(square, `${publicDir}/icon-512.png`, 512);
  await ico(rounded, `${publicDir}/favicon.ico`, [16, 32, 48]);
}
await mkdir(path("apps/www/public/brand"), { recursive: true });
// The marketing site still points at this file name; its copy is rebranded separately.
await png(rounded, "apps/www/public/brand/rakazo-mark.png", 256);
// The web app tints the mark with the theme foreground through a CSS mask.
await png(rounded, "apps/web/public/sydney-mark.png", 256);
await png(rounded, "apps/mobile/assets/favicon.png", 128);
await png(square, "apps/desktop/assets/icon.png", 1024);
await png(square, "apps/desktop/assets/icon-macos.png", 1024);
await ico(rounded, "apps/desktop/assets/icon.ico", [16, 32, 48, 64, 128, 256]);
await png(square, "apps/mobile/assets/icon.png", 1024);
await png(square, "apps/mobile/assets/adaptive-icon.png", 1024);

// The launcher background layer is left empty so the mark is not forced onto a dark plate.
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .png()
  .toFile(path("apps/mobile/assets/icon-background.png"));

// The splash and themed launcher shapes show the mark alone, with no plate.
await sharp(rounded)
  .resize(620, 620)
  .extend({ top: 202, bottom: 202, left: 202, right: 202, background: "transparent" })
  .png()
  .toFile(path("apps/mobile/assets/splash-icon.png"));

async function whiteSilhouette(input: Buffer, name: string, size: number) {
  const alpha = await sharp(input).resize(size, size).extractChannel("alpha").toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "white" } })
    .joinChannel(alpha)
    .png()
    .toFile(path(name));
}

// Android themed launchers and notification icons need white alpha silhouettes.
await whiteSilhouette(rounded, "apps/mobile/assets/monochrome-icon.png", 1024);
await whiteSilhouette(rounded, "apps/mobile/assets/notification-icon.png", 72);
