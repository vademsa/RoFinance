import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { generateBrandAssets } from '../../scripts/generate-mobile-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const android = 'RoFinance-Mobile/android/app/src/main/res';
const ios = 'RoFinance-Mobile/ios/App/App/Assets.xcassets';
let stage;
let originals;
before(async () => {
  stage = await mkdtemp(join(tmpdir(), 'rofinance-brand-test-'));
  originals = await Promise.all((await readdir(join(root, 'Logo'))).map(async name => [name, await readFile(join(root, 'Logo', name))]));
  await generateBrandAssets(stage);
});
after(async () => { if (stage) await rm(stage, { recursive: true, force: true }); });

test('web assets use the uploaded artwork without changing the originals and legacy favicons remain compatible', async () => {
  for (const [name, data] of originals) assert.deepEqual(await readFile(join(root, 'Logo', name)), data);
  for (const size of [16, 32, 192]) {
    const metadata = await sharp(join(stage, `src/assets/brand/favicon-${size}.png`)).metadata();
    assert.equal(metadata.width, size); assert.equal(metadata.height, size); assert.equal(metadata.hasAlpha, true);
  }
  const wordmark = await sharp(join(stage, 'src/assets/brand/rofinance-wordmark.png')).metadata();
  assert.equal(wordmark.width, 816); assert.equal(wordmark.height, 222); assert.equal(wordmark.hasAlpha, true);
  for (const path of ['src/assets/brand/rofinance-wordmark.png', 'src/assets/brand/rofinance-icon.png', 'src/assets/brand/favicon-16.png', 'src/assets/brand/favicon-32.png', 'src/assets/brand/favicon-192.png', 'public/favicon.svg', 'public/favicon.png', 'public/favicon.ico', 'public/apple-touch-icon.png']) {
    assert.deepEqual(await readFile(join(stage, path)), await readFile(join(root, path)));
  }
  const ico = await readFile(join(stage, 'public/favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt32LE(18), 22); assert.equal(ico.length, 22 + ico.readUInt32LE(14));
  assert.deepEqual(ico.subarray(22), await readFile(join(stage, 'public/favicon.png')));
  const svg = await readFile(join(stage, 'public/favicon.svg'), 'utf8');
  assert.match(svg, /href="data:image\/png;base64,/); assert.doesNotMatch(svg, /<path|<text|https?:\/\/(?!www.w3.org)/);
  const app = await sharp(join(stage, `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`)).metadata();
  assert.equal(app.width, 1024); assert.equal(app.height, 1024); assert.equal(app.hasAlpha, false); assert.equal(app.channels, 3);
  assert.deepEqual(await readFile(join(stage, 'public/apple-touch-icon.png')), await readFile(join(stage, 'src/assets/brand/apple-touch-icon.png')));
});

test('active assets match the three latest colour uploads, preserving transparent pixels', async () => {
  for (const [name, path, size] of [
    ['ChatGPT Image Oct 12, 2026, 12_03_06 AM-1.png', 'src/assets/brand/rofinance-wordmark.png', 816],
    ['ChatGPT Image Oct 12, 2026, 12_03_09 AM-3.png', 'src/assets/brand/rofinance-icon.png', 256],
  ]) {
    const source = join(root, 'Logo', name);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top);
    left = Math.max(0, left - 16); top = Math.max(0, top - 16);
    right = Math.min(info.width - 1, right + 16); bottom = Math.min(info.height - 1, bottom + 16);
    const cropped = await sharp(source).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
    const expected = path.endsWith('rofinance-wordmark.png') ? sharp(cropped).resize({ width: size }) : sharp(cropped).resize(size, size, { fit: 'contain', background: '#00000000' });
    assert.ok((await readFile(join(stage, path))).equals(await expected.png({ compressionLevel: 9 }).toBuffer()), 'Generated artwork must match the active transparent source: ' + name);
    const pixels = await sharp(join(stage, path)).ensureAlpha().raw().toBuffer();
    assert.equal(pixels[3], 0);
  }
  const expectedApp = await sharp(join(root, 'Logo/ChatGPT Image Oct 12, 2026, 12_03_07 AM-2.png'))
    .resize(1024, 1024).flatten({ background: '#ffffff' }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  assert.ok((await readFile(join(stage, `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`))).equals(expectedApp), 'Generated iOS artwork must match the active opaque source');
});

test('all five Android densities are regenerated and adaptive artwork stays inside the mask safe zone', async () => {
  for (const [density, legacy, adaptive] of [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]) {
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
      const path = `${android}/mipmap-${density}/${name}.png`;
      assert.deepEqual(await readFile(join(stage, path)), await readFile(join(root, path)));
      const metadata = await sharp(join(stage, path)).metadata();
      assert.equal(metadata.width, name.endsWith('foreground') ? adaptive : legacy); assert.equal(metadata.height, metadata.width);
    }
    const { data, info } = await sharp(join(stage, `${android}/mipmap-${density}/ic_launcher_foreground.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const margin = Math.floor((adaptive - Math.round(adaptive * 64 / 108)) / 2);
    let nonempty = false;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      nonempty = true; assert.ok(x >= margin && x < adaptive - margin && y >= margin && y < adaptive - margin);
    }
    assert.equal(nonempty, true);
  }
  assert.match(await readFile(join(root, android, 'drawable-v24/ic_launcher_foreground.xml'), 'utf8'), /@mipmap\/ic_launcher_foreground/);
  assert.match(await readFile(join(root, android, 'values/ic_launcher_background.xml'), 'utf8'), /#F4F8FF/);
});

test('every Android/iOS splash retains native dimensions and is reproducible from the new source', async () => {
  for (const folder of (await readdir(join(root, android))).filter(name => name === 'drawable' || /^drawable-(port|land)-/.test(name))) {
    const path = `${android}/${folder}/splash.png`;
    const expected = await sharp(join(root, path)).metadata();
    const actual = await sharp(join(stage, path)).metadata();
    assert.equal(actual.width, expected.width); assert.equal(actual.height, expected.height); assert.equal(actual.hasAlpha, false);
    assert.deepEqual(await readFile(join(stage, path)), await readFile(join(root, path)));
  }
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    const metadata = await sharp(join(stage, `${ios}/Splash.imageset/${name}`)).metadata();
    assert.equal(metadata.width, 2732); assert.equal(metadata.height, 2732); assert.equal(metadata.hasAlpha, false);
  }
});
