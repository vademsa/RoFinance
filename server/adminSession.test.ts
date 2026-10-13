import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import session from 'express-session';

test('revoked signed web sessions stay denied even if saved again; auth/me and real requireAuth agree; lookup errors fail closed', async () => {
  process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/admin_session_unit_only';
  const { protectRevokedSessionStore, requireAuth } = await import('./auth');
  const { pool } = await import('./db');
  const { earlyAdminHeaders, adminErrorBoundary } = await import('./adminRoutes');
  const memory = new session.MemoryStore(); const revoked = new Set<string>(); let fail = false; let sid = '';
  const owner = randomUUID();
  const db = { query: async (sql: string, values: unknown[]) => { assert.equal(sql, 'SELECT 1 FROM admin_revoked_web_sessions WHERE sid=$1'); if (fail) throw new Error('PRIVATE_DATABASE_DETAIL'); return { rows: revoked.has(String(values[0])) ? [{ valid: 1 }] : [] }; } };
  protectRevokedSessionStore(memory, db as never);
  const app = express(); app.use(earlyAdminHeaders);
  app.use(session({ store: memory, secret: randomBytes(32).toString('hex'), resave: false, saveUninitialized: false }));
  app.post('/fixture-login', (req, res) => { req.session.userId = owner; sid = req.sessionID; res.json({ ok: true }); });
  app.get('/api/auth/me', (req, res) => res.json({ user: req.session.userId ?? null }));
  app.get('/api/admin/fixture', requireAuth, (_req, res) => res.json({ allowed: true }));
  app.use(adminErrorBoundary);
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  const login = async () => (await fetch(base + '/fixture-login', { method: 'POST' })).headers.get('set-cookie')!.split(';')[0];
  try {
    const cookie = await login();
    assert.equal((await fetch(base + '/api/admin/fixture', { headers: { Cookie: cookie } })).status, 200);
    revoked.add(sid); // Keep the original row in MemoryStore: reproduces resurrection.
    assert.equal((await fetch(base + '/api/admin/fixture', { headers: { Cookie: cookie } })).status, 401);
    assert.deepEqual(await (await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).json(), { user: null });
    const fresh = await login();
    assert.equal((await fetch(base + '/api/admin/fixture', { headers: { Cookie: fresh } })).status, 200);
    fail = true;
    const error = await fetch(base + '/api/admin/fixture', { headers: { Cookie: fresh } });
    assert.equal(error.status, 503); assert.equal(error.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await error.json(), { error: 'ADMIN_UNAVAILABLE' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
