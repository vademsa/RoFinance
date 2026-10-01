import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db';
import { getMobileJwtConfig, issueMobileAccessToken, verifyMobileAccessJwt } from './mobileJwt';

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      mobileSessionId?: string;
    }
  }
}

const REFRESH_LIFETIME_DAYS = 30;
const makeRefreshToken = () => randomBytes(32).toString('base64url');
const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createMobileSession(userId: string) {
  if (!getMobileJwtConfig()) throw new Error('Mobile JWT chưa được cấu hình');
  const refreshToken = makeRefreshToken();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query<{ id: string }>(
      `INSERT INTO mobile_sessions (user_id, expires_at)
       VALUES ($1, NOW() + INTERVAL '30 days') RETURNING id`,
      [userId]
    );
    const sessionId = result.rows[0].id;
    await db.query(
      `INSERT INTO mobile_refresh_tokens (session_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [sessionId, hashRefreshToken(refreshToken)]
    );
    await db.query('COMMIT');
    return { ...(await issueMobileAccessToken(userId, sessionId)), refreshToken, refreshExpiresIn: REFRESH_LIFETIME_DAYS * 86400 };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function rotateMobileRefreshToken(token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  if (!getMobileJwtConfig()) return null;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query<{
      token_id: string;
      session_id: string;
      user_id: string;
      used_at: Date | null;
      token_expires_at: Date;
      session_expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT t.id AS token_id, t.session_id, s.user_id, t.used_at,
              t.expires_at AS token_expires_at, s.expires_at AS session_expires_at, s.revoked_at
       FROM mobile_refresh_tokens t
       JOIN mobile_sessions s ON s.id = t.session_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t, s`,
      [hashRefreshToken(token)]
    );
    const row = result.rows[0];
    if (!row) {
      await db.query('ROLLBACK');
      return null;
    }
    if (row.used_at && !row.revoked_at) {
      await db.query('UPDATE mobile_sessions SET revoked_at = NOW() WHERE id = $1', [row.session_id]);
      await db.query('COMMIT');
      return null;
    }
    if (row.revoked_at || row.token_expires_at <= new Date() || row.session_expires_at <= new Date()) {
      await db.query('ROLLBACK');
      return null;
    }
    const nextRefreshToken = makeRefreshToken();
    await db.query('UPDATE mobile_refresh_tokens SET used_at = NOW() WHERE id = $1', [row.token_id]);
    await db.query(
      `INSERT INTO mobile_refresh_tokens (session_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [row.session_id, hashRefreshToken(nextRefreshToken)]
    );
    await db.query(
      `UPDATE mobile_sessions
       SET expires_at = NOW() + INTERVAL '30 days', last_used_at = NOW()
       WHERE id = $1`,
      [row.session_id]
    );
    await db.query('COMMIT');
    return {
      ...(await issueMobileAccessToken(row.user_id, row.session_id)),
      refreshToken: nextRefreshToken,
      refreshExpiresIn: REFRESH_LIFETIME_DAYS * 86400,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function verifyMobileBearer(header: string | undefined) {
  if (!header || !/^Bearer [^\s]+$/.test(header)) return null;
  let claims: { userId: string; sessionId: string };
  try {
    claims = await verifyMobileAccessJwt(header.slice(7));
  } catch {
    return null;
  }
  const result = await pool.query(
    `SELECT 1 FROM mobile_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2
       AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [claims.sessionId, claims.userId]
  );
  return result.rowCount ? claims : null;
}

export async function requireMobileAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = await verifyMobileBearer(req.get('authorization'));
    if (!claims) {
      res.status(401).json({ error: 'Phiên mobile không hợp lệ hoặc đã hết hạn' });
      return;
    }
    req.authUserId = claims.userId;
    req.mobileSessionId = claims.sessionId;
    next();
  } catch (error) {
    next(error);
  }
}

export async function revokeMobileSession(sessionId: string, userId: string) {
  await pool.query(
    'UPDATE mobile_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
}
