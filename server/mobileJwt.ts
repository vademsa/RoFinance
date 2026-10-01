import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'rofinance-api';
const AUDIENCE = 'rofinance-mobile';
const ACCESS_TOKEN_SECONDS = 15 * 60;

export interface MobileJwtConfig {
  activeKid: string;
  keys: Map<string, Uint8Array>;
}

export function parseMobileJwtConfig(rawKeys: string | undefined, activeKid: string | undefined): MobileJwtConfig | null {
  if (!rawKeys && !activeKid) return null;
  if (!rawKeys || !activeKid || !/^[a-zA-Z0-9._-]{1,32}$/.test(activeKid)) {
    throw new Error('MOBILE_JWT_KEYS và MOBILE_JWT_ACTIVE_KID phải được cấu hình hợp lệ');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    throw new Error('MOBILE_JWT_KEYS phải là JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MOBILE_JWT_KEYS phải là JSON object');
  }
  const entries = Object.entries(parsed);
  if (entries.length < 1 || entries.length > 8) {
    throw new Error('MOBILE_JWT_KEYS phải chứa từ 1 đến 8 khóa');
  }
  const keys = new Map<string, Uint8Array>();
  for (const [kid, encoded] of entries) {
    if (!/^[a-zA-Z0-9._-]{1,32}$/.test(kid) || typeof encoded !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error('MOBILE_JWT_KEYS chứa khóa không hợp lệ');
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 32 || bytes.toString('base64') !== encoded) {
      throw new Error('Mỗi khóa JWT phải là ít nhất 32 byte ngẫu nhiên, mã hóa base64 chuẩn');
    }
    keys.set(kid, bytes);
  }
  if (!keys.has(activeKid)) throw new Error('MOBILE_JWT_ACTIVE_KID không có trong MOBILE_JWT_KEYS');
  return { activeKid, keys };
}

let cachedConfig: MobileJwtConfig | null | undefined;
let cachedSource = '';

export function getMobileJwtConfig(): MobileJwtConfig | null {
  const source = `${process.env.MOBILE_JWT_ACTIVE_KID || ''}\0${process.env.MOBILE_JWT_KEYS || ''}`;
  if (cachedConfig === undefined || cachedSource !== source) {
    cachedConfig = parseMobileJwtConfig(process.env.MOBILE_JWT_KEYS, process.env.MOBILE_JWT_ACTIVE_KID);
    cachedSource = source;
  }
  return cachedConfig;
}

export async function issueMobileAccessToken(userId: string, sessionId: string, config = getMobileJwtConfig()) {
  if (!config) throw new Error('Mobile JWT chưa được cấu hình');
  const key = config.keys.get(config.activeKid)!;
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: config.activeKid })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(key);
  return { accessToken: token, tokenType: 'Bearer' as const, expiresIn: ACCESS_TOKEN_SECONDS };
}

export async function verifyMobileAccessJwt(token: string, config = getMobileJwtConfig()) {
  if (!config || token.length > 8192) throw new Error('Token không hợp lệ');
  const { payload } = await jwtVerify(token, (header) => {
    if (header.alg !== 'HS256' || header.typ !== 'at+jwt' ||
      typeof header.kid !== 'string' || !config.keys.has(header.kid)) {
      throw new Error('JWT header không hợp lệ');
    }
    return config.keys.get(header.kid)!;
  }, {
    algorithms: ['HS256'],
    typ: 'at+jwt',
    issuer: ISSUER,
    audience: AUDIENCE,
    maxTokenAge: '15 minutes',
    requiredClaims: ['exp', 'jti', 'sid', 'sub'],
  });
  if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub) ||
    typeof payload.sid !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sid)) {
    throw new Error('JWT claims không hợp lệ');
  }
  return { userId: payload.sub, sessionId: payload.sid };
}
