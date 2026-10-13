import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db';
import { verifyMobileBearer } from './mobileAuth';
import { passwordPolicyError } from '../shared/passwordPolicy';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    email: string;
    oauthState?: string;
    oauthProvider?: 'google' | 'apple';
  }
}

const PgSession = connectPgSimple(session);

export function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET phải được cấu hình và dài ít nhất 32 ký tự');
  }
  const store = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true });
  protectRevokedSessionStore(store, pool);
  return session({
    store,
    name: 'rofinance.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}
export function protectRevokedSessionStore(store: Pick<session.Store, 'get'>, database: Pick<typeof pool, 'query'>) {
  const getSession = store.get.bind(store);
  // A deleted session can be saved again by an already-running request. Retain
  // revocation tombstones and reject it at hydration, including /auth/me.
  store.get = (sid, callback) => {
    void database.query('SELECT 1 FROM admin_revoked_web_sessions WHERE sid=$1', [sid]).then(result => {
      if (result.rows.length) callback(null, null);
      else getSession(sid, callback);
    }).catch(error => callback(error));
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authorization = req.get('authorization');
    if (authorization) {
      const claims = await verifyMobileBearer(authorization);
      if (!claims) {
        res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
        return;
      }
      req.authUserId = claims.userId;
      req.mobileSessionId = claims.sessionId;
      next();
      return;
    }
    if (!req.session.userId) {
      res.status(401).json({ error: 'Bạn cần đăng nhập để sử dụng chức năng này' });
      return;
    }
    req.authUserId = req.session.userId;
    next();
  } catch (error) {
    next(error);
  }
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateCredentials(email: string, password: unknown): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không hợp lệ';
  return passwordPolicyError(password);
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
