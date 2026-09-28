import sharp from 'sharp';

export const MAX_AVATAR_BYTES = 1024 * 1024;
const MAX_AVATAR_PIXELS = 4096 * 4096;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProfileUpdate {
  displayName: string;
  hasAvatarUpdate: boolean;
  avatarData: Buffer | null;
  avatarMime: string | null;
}

export function defaultDisplayName(email: string) {
  const localPart = email.split('@')[0]?.trim() || 'Người dùng RoFinance';
  return Array.from(localPart).slice(0, 60).join('');
}

function hasMatchingImageSignature(mimeType: string, bytes: Buffer) {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export function validateProfileUpdate(
  rawDisplayName: unknown,
  rawAvatarDataUrl: unknown,
): { value?: ProfileUpdate; error?: string } {
  if (typeof rawDisplayName !== 'string') return { error: 'Tên hiển thị không hợp lệ' };

  const displayName = rawDisplayName.trim().replace(/\s+/g, ' ');
  const displayNameLength = Array.from(displayName).length;
  if (displayNameLength < 1) return { error: 'Tên hiển thị không được để trống' };
  if (displayNameLength > 60) return { error: 'Tên hiển thị tối đa 60 ký tự' };
  if (/[\u0000-\u001f\u007f]/.test(displayName)) {
    return { error: 'Tên hiển thị chứa ký tự không hợp lệ' };
  }

  if (rawAvatarDataUrl === undefined) {
    return {
      value: { displayName, hasAvatarUpdate: false, avatarData: null, avatarMime: null },
    };
  }
  if (rawAvatarDataUrl === null || rawAvatarDataUrl === '') {
    return {
      value: { displayName, hasAvatarUpdate: true, avatarData: null, avatarMime: null },
    };
  }
  if (typeof rawAvatarDataUrl !== 'string') return { error: 'Ảnh đại diện không hợp lệ' };

  const match = rawAvatarDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return { error: 'Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP' };

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
    return { error: 'Ảnh đại diện phải nhỏ hơn 1 MB' };
  }
  if (!hasMatchingImageSignature(match[1], bytes)) {
    return { error: 'Nội dung ảnh đại diện không hợp lệ' };
  }

  return {
    value: {
      displayName,
      hasAvatarUpdate: true,
      avatarData: bytes,
      avatarMime: match[1],
    },
  };
}

export async function sanitizeAvatar(avatarData: Buffer) {
  try {
    const sanitized = await sharp(avatarData, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: MAX_AVATAR_PIXELS,
    })
      .rotate()
      .resize(384, 384, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
    if (sanitized.length === 0 || sanitized.length > MAX_AVATAR_BYTES) {
      throw new Error('Ảnh sau khi xử lý vượt quá giới hạn');
    }
    return { data: sanitized, mime: 'image/webp' } as const;
  } catch {
    throw new Error('Nội dung ảnh đại diện bị hỏng hoặc kích thước không hợp lệ');
  }
}
