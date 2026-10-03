import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000,
});

export async function verifyGoogleIdToken(
  idToken: unknown,
  expectedClientId: string,
  keys: JWTVerifyGetKey = googleKeys,
) {
  if (typeof idToken !== 'string' || idToken.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) {
    throw new Error('Google ID token không hợp lệ');
  }
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: expectedClientId,
    requiredClaims: ['exp', 'iat', 'sub'],
    maxTokenAge: '10 minutes',
  });
  if (payload.aud !== expectedClientId || typeof payload.sub !== 'string' ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub) ||
    typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    payload.email_verified !== true) {
    throw new Error('Google ID token thiếu thông tin tài khoản đã xác minh');
  }
  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    // Google is authoritative for Gmail and hosted Workspace addresses. A
    // verified third-party address alone is not enough to link an old account.
    allowEmailLink: payload.email.toLowerCase().endsWith('@gmail.com') ||
      (typeof payload.hd === 'string' && payload.hd.length > 0),
  };
}
