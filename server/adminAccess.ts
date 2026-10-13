import type { RequestHandler } from 'express';
import type { Pool } from 'pg';

// Deliberately not configurable via environment, app_config, roles or clients.
// A new account reusing this email must not inherit this existing identity.
export const ADMIN_ACCOUNT_ID = '93ec3f6c-4c98-4502-a90f-e9f2ca7b1900';
export const ADMIN_ACCOUNT_EMAIL = 'darkroller210@gmail.com';

export function createAdminGuard(database: Pick<Pool, 'query'>): RequestHandler {
  return async (req, res, next) => {
    // This value is set exclusively by requireAuth, not by request inputs.
    if (!req.authUserId) { res.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    if (req.authUserId !== ADMIN_ACCOUNT_ID) { res.status(403).json({ error: 'ADMIN_FORBIDDEN' }); return; }
    try {
      const result = await database.query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id=$1', [req.authUserId]);
      const user = result.rows[0];
      if (result.rows.length !== 1 || user.id !== ADMIN_ACCOUNT_ID || user.email.toLowerCase() !== ADMIN_ACCOUNT_EMAIL) {
        res.status(403).json({ error: 'ADMIN_FORBIDDEN' }); return;
      }
      next();
    } catch { res.status(503).json({ error: 'ADMIN_UNAVAILABLE' }); }
  };
}
