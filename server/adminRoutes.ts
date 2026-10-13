import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import path from 'node:path';
import type { Pool } from 'pg';
import { rateLimit } from 'express-rate-limit';
import type { AdminStore } from './adminStore';
import { CharacterError } from './characterStore';
import { COSMETICS } from '../shared/character';
import { isAdminApiPath, isAdminPagePath, type AdminOverview } from '../shared/admin';
import { createAdminGuard } from './adminAccess';

export const adminHeaders: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie'); res.vary('Authorization');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
};
// Apply before parsers/sessions too, so failures do not leak cacheable errors.
export const earlyAdminHeaders: RequestHandler = (req, res, next) => {
  if (isAdminPagePath(req.path) || isAdminApiPath(req.path)) adminHeaders(req, res, next);
  else next();
};
export const adminErrorBoundary: ErrorRequestHandler = (error, req, res, next) => {
  if (!isAdminPagePath(req.path) && !isAdminApiPath(req.path)) { next(error); return; }
  if (res.headersSent) { res.destroy(); return; }
  const invalid = error && typeof error === 'object' && ['entity.parse.failed', 'entity.too.large'].includes(error.type);
  res.status(invalid ? error.type === 'entity.too.large' ? 413 : 400 : 503).json({ error: invalid ? 'INVALID_INPUT' : 'ADMIN_UNAVAILABLE' });
};
const privateErrors: ErrorRequestHandler = (_error, _req, res, _next) => {
  if (res.headersSent) { res.destroy(); return; }
  res.status(503).json({ error: 'ADMIN_UNAVAILABLE' });
};
export function createAdminRouter(database: Pick<Pool, 'query'>, authenticate: RequestHandler, readRelease: () => AdminOverview['release'], operations?: AdminStore) {
  const router = express.Router();
  router.use(adminHeaders, authenticate, createAdminGuard(database));
  router.get('/overview', async (req, res) => {
    if (Object.keys(req.query).length || req.body && Object.keys(req.body).length) { res.status(400).json({ error: 'INVALID_INPUT' }); return; }
    try {
      // Aggregate metadata only: no user_data, banking, account directory,
      // password hashes, session credentials or per-owner game records.
      const result = await database.query<AdminOverview['counts']>(`SELECT
        (SELECT COUNT(*)::int FROM users) AS accounts,
        (SELECT COUNT(*)::int FROM character_profiles) AS characters,
        (SELECT COUNT(*)::int FROM character_profiles WHERE state->>'optIn'='true') AS "rankingParticipants",
        (SELECT COUNT(*)::int FROM character_actions WHERE fingerprint='draw:' AND created_at >= NOW() - INTERVAL '7 days') AS "drawsLast7Days"`);
      if (result.rows.length !== 1) throw new Error('COUNTS_UNAVAILABLE');
      // Keep the old overview envelope readable so an already-open dashboard
      // can detect the new API revision and reload into the operational UI.
      const overview: AdminOverview = { version: 1, mode: 'read-only', operationsEnabled: Boolean(operations), generatedAt: new Date().toISOString(),
        counts: { accounts: result.rows[0].accounts, characters: result.rows[0].characters, rankingParticipants: result.rows[0].rankingParticipants, drawsLast7Days: result.rows[0].drawsLast7Days },
        catalogue: { total: COSMETICS.length, prizes: COSMETICS.filter(item => !item.starter).length, signature: COSMETICS.filter(item => item.exclusive).length, hidden: COSMETICS.filter(item => item.secret).length },
        release: readRelease() };
      res.json(overview);
    } catch { res.status(503).json({ error: 'ADMIN_UNAVAILABLE' }); }
  });
  router.all('/overview', (_req, res) => { res.set('Allow', 'GET, HEAD'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); });
  if (operations) {
    const fail = (error: unknown, res: express.Response) => { res.status(error instanceof CharacterError ? error.status : 503).json({ error: error instanceof CharacterError ? error.code : 'ADMIN_UNAVAILABLE' }); };
    for (const kind of ['accounts', 'audit'] as const) {
      router.get(`/${kind}`, async (req, res) => {
        try {
          if (req.body && Object.keys(req.body).length) throw new CharacterError('INVALID_INPUT');
          res.json(await operations[kind](req.query));
        } catch (error) { fail(error, res); }
      });
      router.all(`/${kind}`, (_req, res) => { res.set('Allow', 'GET, HEAD'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); });
    }
    const limiter = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
      keyGenerator: req => req.authUserId!, message: { error: 'ADMIN_RATE_LIMITED' } });
    router.get('/accounts/:targetId/inventory', async (req, res) => {
      try {
        if (Object.keys(req.query).length || req.body && Object.keys(req.body).length) throw new CharacterError('INVALID_INPUT');
        res.json(await operations.inventory(req.params.targetId));
      } catch (error) { fail(error, res); }
    });
    router.all('/accounts/:targetId/inventory', (_req, res) => { res.set('Allow', 'GET, HEAD'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); });
    for (const kind of ['revoke-sessions', 'grant-points', 'revoke-points', 'grant-item', 'revoke-item'] as const) {
      router.post(`/operations/${kind}`, limiter, async (req, res) => {
        try {
          if (Object.keys(req.query).length || !req.is('application/json')) throw new CharacterError('INVALID_INPUT');
          // Cookie writes require an explicit same-origin browser request. JWT
          // clients are still subject to the application's cross-site guard.
          if (!req.get('authorization')) {
            let allowed = false;
            try { allowed = new URL(req.get('origin') ?? '').origin === new URL(`${req.protocol}://${req.get('host')}`).origin; } catch { /* deny */ }
            if (!allowed) throw new CharacterError('ADMIN_ORIGIN_REQUIRED', 403);
          }
          res.json(await operations.operate(req.authUserId!, kind, req.body));
        } catch (error) { fail(error, res); }
      });
      router.all(`/operations/${kind}`, (_req, res) => { res.set('Allow', 'POST'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); });
    }
  }
  router.use((_req, res) => { res.status(404).json({ error: 'ADMIN_NOT_FOUND' }); });
  router.use(privateErrors);
  return router;
}

export function createAdminPageHandler(database: Pick<Pool, 'query'>, authenticate: RequestHandler, webDir: string): RequestHandler {
  const protectedPage = express.Router();
  protectedPage.use(adminHeaders, authenticate, createAdminGuard(database));
  protectedPage.use((req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
    if (!['GET', 'HEAD'].includes(req.method)) { res.set('Allow', 'GET, HEAD'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return; }
    // Canonical page only; other namespace paths stay protected but are 404.
    if (req.path !== '/admin' && req.path !== '/admin/') { res.status(404).json({ error: 'ADMIN_NOT_FOUND' }); return; }
    res.sendFile(path.join(webDir, 'index.html'), error => { if (error) next(error); });
  });
  protectedPage.use(privateErrors);
  return (req, res, next) => { if (isAdminPagePath(req.path)) protectedPage(req, res, next); else next(); };
}
