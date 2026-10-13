import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRes = join(root, 'RoFinance-Mobile/android/app/src/main/res');
const sources = {
  wordmark: join(root, 'Logo/ChatGPT Image Oct 12, 2026, 12_03_06 AM-1.png'),
  icon: join(root, 'Logo/ChatGPT Image Oct 12, 2026, 12_03_09 AM-3.png'),
  app: join(root, 'Logo/ChatGPT Image Oct 12, 2026, 12_03_07 AM-2.png'),
};
const background = '#09090b';

// Remove transparent canvas margins, not the uploaded artwork or its colours.
async function cropTransparentCanvas(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Empty logo: ' + path);
  left = Math.max(0, left - 16); top = Math.max(0, top - 16);
  right = Math.min(info.width - 1, right + 16); bottom = Math.min(info.height - 1, bottom + 16);
  return sharp(path).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
}

export async function generateBrandAssets(outputRoot = root) {
  for (const path of [sources.icon, sources.wordmark]) {
    if (!(await sharp(path).metadata()).hasAlpha) throw new Error('A transparent branding source is required: ' + path);
  }
  const mark = await cropTransparentCanvas(sources.icon);
  const wordmark = await cropTransparentCanvas(sources.wordmark);
  const renderLogo = size => sharp(mark).resize(size, size, { fit: 'contain', background: '#00000000' }).png({ compressionLevel: 9 }).toBuffer();
  const write = async (relative, data) => {
    const destination = join(outputRoot, relative);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  };
  const androidPath = 'RoFinance-Mobile/android/app/src/main/res';
  const iosPath = 'RoFinance-Mobile/ios/App/App/Assets.xcassets';

  await write('src/assets/brand/rofinance-wordmark.png', await sharp(wordmark).resize({ width: 816 }).png({ compressionLevel: 9 }).toBuffer());
  await write('src/assets/brand/rofinance-icon.png', await renderLogo(256));
  for (const size of [16, 32, 192]) await write('src/assets/brand/favicon-' + size + '.png', await renderLogo(size));
  // iOS applies its own mask and requires an opaque, full-square RGB icon.
  const appIcon = await sharp(sources.app).resize(1024, 1024).flatten({ background: '#ffffff' }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  const appleIcon = await sharp(appIcon).resize(180, 180).png().toBuffer();
  await write('src/assets/brand/apple-touch-icon.png', appleIcon);
  await write('public/apple-touch-icon.png', appleIcon);
  const favicon = await renderLogo(32);
  await write('public/favicon.png', favicon);
  // Retain compatibility with the old public SVG URL without the old artwork.
  await write('public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,' + (await renderLogo(256)).toString('base64') + '"/></svg>\n');
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico[6] = 32; ico[7] = 32; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(favicon.length, 14); ico.writeUInt32LE(22, 18);
  await write('public/favicon.ico', Buffer.concat([ico, favicon]));
  await write(iosPath + '/AppIcon.appiconset/AppIcon-512@2x.png', appIcon);

  for (const [density, legacySize, adaptiveSize] of [
    ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
  ]) {
    const folder = androidPath + '/mipmap-' + density;
    const legacyIcon = await sharp(appIcon).resize(legacySize, legacySize).png().toBuffer();
    await write(folder + '/ic_launcher.png', legacyIcon);
    const circle = Buffer.from('<svg width="' + legacySize + '" height="' + legacySize + '" xmlns="http://www.w3.org/2000/svg"><circle cx="' + legacySize / 2 + '" cy="' + legacySize / 2 + '" r="' + legacySize / 2 + '" fill="white"/></svg>');
    await write(folder + '/ic_launcher_round.png', await sharp(legacyIcon).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer());
    // Keep the whole transparent mark inside Android's central 66/108 safe zone.
    const foregroundSize = Math.round(adaptiveSize * 64 / 108);
    const offset = Math.floor((adaptiveSize - foregroundSize) / 2);
    const foreground = await sharp({ create: { width: adaptiveSize, height: adaptiveSize, channels: 4, background: '#00000000' } })
      .composite([{ input: await renderLogo(foregroundSize), left: offset, top: offset }]).png().toBuffer();
    await write(folder + '/ic_launcher_foreground.png', foreground);
  }

  async function renderSplash(width, height) {
    const size = Math.round(Math.min(width, height) * 0.34);
    return sharp({ create: { width, height, channels: 3, background } })
      .composite([{ input: await renderLogo(size), left: Math.floor((width - size) / 2), top: Math.floor((height - size) / 2) }])
      .removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  }
  for (const folder of (await readdir(androidRes)).filter(name => name === 'drawable' || name.startsWith('drawable-port-') || name.startsWith('drawable-land-'))) {
    const { width, height } = await sharp(join(androidRes, folder, 'splash.png')).metadata();
    if (!width || !height) throw new Error('Invalid splash dimensions: ' + folder);
    await write(androidPath + '/' + folder + '/splash.png', await renderSplash(width, height));
  }
  const iosSplash = await renderSplash(2732, 2732);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await write(iosPath + '/Splash.imageset/' + name, iosSplash);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('This generator does not accept arguments.');
  await generateBrandAssets();
  console.log('Generated web branding, favicons, Android/iOS icons and splash screens from Logo/.');
}
