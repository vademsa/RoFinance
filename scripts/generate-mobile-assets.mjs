import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRes = join(root, 'RoFinance-Mobile/android/app/src/main/res');
const iosAssets = join(root, 'RoFinance-Mobile/ios/App/App/Assets.xcassets');
const logo = await readFile(join(root, 'public/favicon.svg'));
const background = '#09090b';

async function renderLogo(size) {
  return sharp(logo, { density: 288 }).resize(size, size).png().toBuffer();
}

// iOS applies its own icon mask. Supply one full-size, opaque RGB asset.
const oversizedLogo = await renderLogo(1138);
const appIcon = await sharp(oversizedLogo)
  .extract({ left: 57, top: 57, width: 1024, height: 1024 })
  .flatten({ background })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(join(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'), appIcon);

const densities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];
for (const [density, legacySize, adaptiveSize] of densities) {
  const folder = join(androidRes, `mipmap-${density}`);
  const legacyIcon = await sharp(appIcon).resize(legacySize, legacySize).png().toBuffer();
  await writeFile(join(folder, 'ic_launcher.png'), legacyIcon);

  const circle = Buffer.from(`<svg width="${legacySize}" height="${legacySize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${legacySize / 2}" cy="${legacySize / 2}" r="${legacySize / 2}" fill="white"/></svg>`);
  const roundIcon = await sharp(legacyIcon)
    .composite([{ input: circle, blend: 'dest-in' }])
    .png()
    .toBuffer();
  await writeFile(join(folder, 'ic_launcher_round.png'), roundIcon);

  // Android masks the outer 18/108 of an adaptive layer. Keep the entire mark
  // inside the central 66/108 safe zone, with a separate solid background.
  const foregroundSize = Math.round(adaptiveSize * 70 / 108);
  const foregroundLogo = await renderLogo(foregroundSize);
  const offset = Math.floor((adaptiveSize - foregroundSize) / 2);
  const foreground = await sharp({
    create: { width: adaptiveSize, height: adaptiveSize, channels: 4, background: '#00000000' },
  })
    .composite([{ input: foregroundLogo, left: offset, top: offset }])
    .png()
    .toBuffer();
  await writeFile(join(folder, 'ic_launcher_foreground.png'), foreground);
}

async function renderSplash(width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.34);
  const splashLogo = await renderLogo(logoSize);
  return sharp({ create: { width, height, channels: 3, background } })
    .composite([{
      input: splashLogo,
      left: Math.floor((width - logoSize) / 2),
      top: Math.floor((height - logoSize) / 2),
    }])
    .flatten({ background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const folderName of (await readdir(androidRes)).filter((name) => name === 'drawable' || name.startsWith('drawable-port-') || name.startsWith('drawable-land-'))) {
  const path = join(androidRes, folderName, 'splash.png');
  const { width, height } = await sharp(path).metadata();
  if (!width || !height) throw new Error(`Invalid splash size: ${path}`);
  await writeFile(path, await renderSplash(width, height));
}

const iosSplash = await renderSplash(2732, 2732);
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(join(iosAssets, 'Splash.imageset', name), iosSplash);
}

console.log('Generated RoFinance Android/iOS launcher icons and splash assets.');
