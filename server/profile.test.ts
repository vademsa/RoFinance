import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  defaultDisplayName,
  MAX_AVATAR_BYTES,
  sanitizeAvatar,
  validateProfileUpdate,
} from './profile';

const pngHeaderOnly = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function createTinyPngDataUrl() {
  const image = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#4f46e5' },
  }).png().toBuffer();
  return `data:image/png;base64,${image.toString('base64')}`;
}

test('normalizes and sanitizes a valid profile update', async () => {
  const tinyPng = await createTinyPngDataUrl();
  const result = validateProfileUpdate('  Nguyễn   An  ', tinyPng);
  assert.equal(result.value?.displayName, 'Nguyễn An');
  assert.equal(result.value?.hasAvatarUpdate, true);
  assert.equal(result.value?.avatarMime, 'image/png');
  assert.ok(result.value?.avatarData?.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  const sanitized = await sanitizeAvatar(result.value!.avatarData!);
  assert.equal(sanitized.mime, 'image/webp');
  assert.ok(sanitized.data.length > 0);
});

test('allows removing an avatar', () => {
  assert.deepEqual(validateProfileUpdate('An', null), {
    value: {
      displayName: 'An',
      hasAvatarUpdate: true,
      avatarData: null,
      avatarMime: null,
    },
  });
});

test('does not replace the avatar when the field is omitted', () => {
  assert.deepEqual(validateProfileUpdate('An', undefined), {
    value: {
      displayName: 'An',
      hasAvatarUpdate: false,
      avatarData: null,
      avatarMime: null,
    },
  });
});

test('rejects empty and overlong display names', () => {
  assert.match(validateProfileUpdate('   ', null).error || '', /không được để trống/);
  assert.match(validateProfileUpdate('a'.repeat(61), null).error || '', /tối đa 60/);
});

test('rejects SVG and files whose signature does not match their MIME type', () => {
  const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`;
  const fakePng = `data:image/png;base64,${Buffer.from('<html/>').toString('base64')}`;
  assert.match(validateProfileUpdate('An', svg).error || '', /PNG, JPEG hoặc WebP/);
  assert.match(validateProfileUpdate('An', fakePng).error || '', /Nội dung ảnh/);
});

test('rejects an avatar larger than the server limit', () => {
  const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1);
  oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dataUrl = `data:image/png;base64,${oversized.toString('base64')}`;
  assert.match(validateProfileUpdate('An', dataUrl).error || '', /nhỏ hơn 1 MB/);
});

test('rejects a truncated image even when its magic bytes match', async () => {
  await assert.rejects(
    () => sanitizeAvatar(pngHeaderOnly),
    /bị hỏng hoặc kích thước không hợp lệ/,
  );
});

test('uses the email local part as a safe initial name', () => {
  assert.equal(defaultDisplayName('nguyen.an@example.com'), 'nguyen.an');
});
