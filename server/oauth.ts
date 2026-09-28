import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import { getConfigValue, pool } from './db';
import { defaultDisplayName } from './profile';

type Provider = 'google' | 'apple';

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export const createOAuthState = () => randomBytes(32).toString('hex');

export async function getPublicAppUrl() {
  const stored = await getConfigValue<string>('app_url');
  const value = stored || process.env.APP_URL;
  if (!value) throw new Error('APP_URL chưa được cấu hình');
  return value.replace(/\/+$/, '');
}

export const getGoogleConfig = () => getConfigValue<GoogleConfig>('google_oauth');
export const getAppleConfig = () => getConfigValue<AppleConfig>('apple_oauth');

export async function getProviderStatus() {
  const [google, apple] = await Promise.all([getGoogleConfig(), getAppleConfig()]);
  return {
    google: Boolean(google?.clientId && google?.clientSecret),
    apple: Boolean(apple?.clientId && apple?.teamId && apple?.keyId && apple?.privateKey),
  };
}

export async function buildGoogleAuthorizationUrl(state: string) {
  const config = await getGoogleConfig();
  if (!config) throw new Error('Đăng nhập Google chưa được cấu hình');
  const callback = `${await getPublicAppUrl()}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  const config = await getGoogleConfig();
  if (!config) throw new Error('Đăng nhập Google chưa được cấu hình');
  const callback = `${await getPublicAppUrl()}/api/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: callback,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResponse.json() as { access_token?: string; error_description?: string };
  if (!tokenResponse.ok || !tokens.access_token) {
    throw new Error(tokens.error_description || 'Không thể xác thực với Google');
  }
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileResponse.json() as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!profileResponse.ok || !profile.sub || !profile.email || !profile.email_verified) {
    throw new Error('Google không cung cấp email đã xác minh');
  }
  return { subject: profile.sub, email: profile.email };
}

export async function buildAppleAuthorizationUrl(state: string) {
  const config = await getAppleConfig();
  if (!config) throw new Error('Đăng nhập Apple chưa được cấu hình');
  const callback = `${await getPublicAppUrl()}/api/auth/apple/callback`;
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callback,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  }).toString();
  return url.toString();
}

async function createAppleClientSecret(config: AppleConfig) {
  const privateKey = await importPKCS8(config.privateKey.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function exchangeAppleCode(code: string) {
  const config = await getAppleConfig();
  if (!config) throw new Error('Đăng nhập Apple chưa được cấu hình');
  const callback = `${await getPublicAppUrl()}/api/auth/apple/callback`;
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: await createAppleClientSecret(config),
      redirect_uri: callback,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResponse.json() as { id_token?: string; error?: string };
  if (!tokenResponse.ok || !tokens.id_token) {
    throw new Error(tokens.error || 'Không thể xác thực với Apple');
  }
  const { payload } = await jwtVerify(tokens.id_token, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: config.clientId,
  });
  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Apple không cung cấp email hợp lệ');
  }
  return { subject: payload.sub, email: payload.email };
}

export async function findOrCreateOAuthUser(provider: Provider, subject: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = await client.query<{ id: string; email: string }>(
      `SELECT u.id, u.email FROM auth_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = $1 AND i.provider_subject = $2`,
      [provider, subject]
    );
    if (identity.rows[0]) {
      await client.query('COMMIT');
      return identity.rows[0];
    }
    let user = (await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE LOWER(email) = $1 FOR UPDATE',
      [email]
    )).rows[0];
    if (!user) {
      user = (await client.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, NULL, $2) RETURNING id, email`,
        [email, defaultDisplayName(email)]
      )).rows[0];
    }
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject)
       VALUES ($1, $2, $3)`,
      [user.id, provider, subject]
    );
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function establishOAuthSession(req: Request, user: { id: string; email: string }) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => error ? reject(error) : resolve())
  );
  req.session.userId = user.id;
  req.session.email = user.email;
}
