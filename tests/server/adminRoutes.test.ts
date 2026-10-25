import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import { ADMIN_ACCOUNT_EMAIL, ADMIN_ACCOUNT_ID } from '../../server/adminAccess';
import { createAdminPageHandler, createAdminRouter, earlyAdminHeaders, adminErrorBoundary } from '../../server/adminRoutes';
import { isAdminOverview } from '../../shared/admin';
import { AdminStore, adminListInput, adminOperationInput } from '../../server/adminStore';

test('real web-session/JWT admin auth: exactly pinned account, fail closed, no claim/input/path/method exceptions or private data', async () => {
  // The real authentication middleware is tested without any production DB
  // connection/session or shared-schema mutation. Only query results are mocked.
  process.env.DATABASE_URL = 'postgresql://127.0.0.1:1/admin_unit_only';
  process.env.MOBILE_JWT_ACTIVE_KID = 'admin-unit';
  process.env.MOBILE_JWT_KEYS = JSON.stringify({ 'admin-unit': randomBytes(32).toString('base64') });
  const { pool } = await import('../../server/db');
  const { requireAuth } = await import('../../server/auth');
  const { issueMobileAccessToken } = await import('../../server/mobileJwt');
  const { SignJWT } = await import('jose');
  const other = randomUUID(); const recreated = randomUUID();
  let storedOwner: { id: string; email: string } | null = { id: ADMIN_ACCOUNT_ID, email: ADMIN_ACCOUNT_EMAIL };
  let unavailable = false; let countsUnavailable = false; let metadataQueries = 0;
  const sessions = new Map<string, { owner: string; revoked: boolean }>();
  const originalQuery = pool.query;
  pool.query = (async (sql: string, values: unknown[]) => {
    if (sql.includes('FROM mobile_sessions')) {
      const s = sessions.get(String(values[0]));
      const valid = s && s.owner === values[1] && !s.revoked;
      return { rows: valid ? [{ valid: 1 }] : [], rowCount: valid ? 1 : 0 };
    }
    if (unavailable) throw new Error('PRIVATE_DB_SECRET');
    if (sql === 'SELECT id, email FROM users WHERE id=$1') return { rows: storedOwner && storedOwner.id === values[0] ? [storedOwner] : [], rowCount: storedOwner ? 1 : 0 };
    assert.ok(!sql.includes('user_data')); assert.ok(!sql.includes('password_hash')); assert.ok(!/INSERT|UPDATE|DELETE/.test(sql));
    metadataQueries++;
    if (countsUnavailable) throw new Error('PRIVATE_DATABASE_DETAILS');
    return { rows: [{ accounts: 4, characters: 3, rankingParticipants: 2, drawsLast7Days: 5, secret: 'MUST_NOT_LEAK', income: 999 }], rowCount: 1 };
  }) as typeof pool.query;
  const release = { apiRevision: 'a'.repeat(64), webRevision: randomUUID() };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rofinance-admin-auth-'));
  await writeFile(path.join(directory, 'index.html'), '<main>PROTECTED_ADMIN_SHELL</main>');
  const app = express();
  app.set('trust proxy', 1);
  let operationCalls = 0;
  const operations = { accounts: async (query: unknown) => { adminListInput(query, true); return { accounts: [], total: 0, page: 1, pageSize: 12 }; },
    inventory: async (targetId: string) => { assert.equal(targetId, other); return { targetId, items: [] }; },
    audit: async (query: unknown) => { adminListInput(query, false); return { entries: [], total: 0, page: 1, pageSize: 12 }; },
    operate: async (actor: string, kind: Parameters<AdminStore['operate']>[1], body: unknown) => { assert.equal(actor, ADMIN_ACCOUNT_ID); const input = adminOperationInput(kind, body); operationCalls++; return { requestId: input.requestId, replayed: false, result: {} }; } } as unknown as AdminStore;
  app.use(earlyAdminHeaders);
  app.use(express.json());
  app.use(session({ secret: randomBytes(32).toString('hex'), resave: false, saveUninitialized: false }));
  app.post('/fixture-login/:id', (req, res) => { req.session.userId = req.params.id; req.session.email = ADMIN_ACCOUNT_EMAIL; res.json({ ok: true }); });
  app.use(createAdminPageHandler(pool, requireAuth, directory));
  app.use('/api/admin', createAdminRouter(pool, requireAuth, () => release, operations));
  app.use(adminErrorBoundary);
  app.get('*', (_req, res) => res.send('PUBLIC_SPA_TRIPWIRE'));
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const cookie = async (owner: string) => {
    const result = await fetch(`${base}/fixture-login/${owner}`, { method: 'POST' });
    return result.headers.get('set-cookie')!.split(';')[0];
  };
  const token = async (owner: string) => { const id = randomUUID(); sessions.set(id, { owner, revoked: false }); return { ...(await issueMobileAccessToken(owner, id)), id }; };
  try {
    const ownerCookie = await cookie(ADMIN_ACCOUNT_ID); const otherCookie = await cookie(other); const recreatedCookie = await cookie(recreated);
    const ownerToken = await token(ADMIN_ACCOUNT_ID); const otherToken = await token(other);
    const key = Buffer.from(JSON.parse(process.env.MOBILE_JWT_KEYS!)['admin-unit'], 'base64');
    const extraClaimsToken = await new SignJWT({ sid: otherToken.id, email: ADMIN_ACCOUNT_EMAIL, role: 'admin', isAdmin: true })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'admin-unit' }).setIssuer('rofinance-api').setAudience('rofinance-mobile')
      .setSubject(other).setJti(randomUUID()).setIssuedAt().setExpirationTime('15m').sign(key);
    const expiredToken = await new SignJWT({ sid: ownerToken.id }).setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'admin-unit' })
      .setIssuer('rofinance-api').setAudience('rofinance-mobile').setSubject(ADMIN_ACCOUNT_ID).setJti(randomUUID())
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
    assert.equal((await fetch(base + '/api/admin/overview', { headers: { Authorization: `Bearer ${extraClaimsToken}` } })).status, 403);
    assert.equal((await fetch(base + '/api/admin/overview', { headers: { Cookie: ownerCookie, Authorization: `Bearer ${expiredToken}` } })).status, 401);
    const ownerHeaders = [{ Cookie: ownerCookie }, { Authorization: `Bearer ${ownerToken.accessToken}` }];
    const paths = ['/admin', '/admin/', '/admin/not-real', '/Admin', '/%61dmin', '/admin%2Fprivate', '/api/admin/overview', '/api/admin/not-real', '/api/ADMIN/overview'];
    for (const route of paths) {
      for (const headers of [{}, { Cookie: otherCookie }, { Cookie: recreatedCookie }, { Authorization: `Bearer ${otherToken.accessToken}` }, { Cookie: ownerCookie, Authorization: 'Bearer invalid' }]) {
        const r = await fetch(base + route, { headers });
        assert.equal(r.status, Object.keys(headers).length === 0 || 'Authorization' in headers && headers.Authorization === 'Bearer invalid' ? 401 : 403, route);
        assert.match(r.headers.get('cache-control') ?? '', /private, no-store/);
        assert.ok((r.headers.get('vary') ?? '').includes('Cookie')); assert.ok((r.headers.get('vary') ?? '').includes('Authorization'));
        assert.equal(r.headers.get('x-frame-options'), 'DENY');
        assert.ok(!(await r.text()).includes('PROTECTED_ADMIN_SHELL'));
      }
    }
    assert.equal(metadataQueries, 0);
    for (const headers of ownerHeaders) {
      const page = await fetch(base + '/admin', { headers }); assert.equal(page.status, 200); assert.match(await page.text(), /PROTECTED_ADMIN_SHELL/);
      assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
      const response = await fetch(base + '/api/admin/overview', { headers }); assert.equal(response.status, 200);
      const payload = await response.json(); assert.ok(isAdminOverview(payload));
      assert.deepEqual(payload.counts, { accounts: 4, characters: 3, rankingParticipants: 2, drawsLast7Days: 5 });
      assert.deepEqual(payload.catalogue, { total: 126, prizes: 119, signature: 7, hidden: 7 });
      assert.ok(!JSON.stringify(payload).includes('MUST_NOT_LEAK')); assert.ok(!JSON.stringify(payload).includes('income'));
      const head = await fetch(base + '/api/admin/overview', { method: 'HEAD', headers }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
      for (const route of ['/api/admin/overview?email=' + ADMIN_ACCOUNT_EMAIL, '/api/admin/overview?role=admin', '/api/admin/overview?userId=' + ADMIN_ACCOUNT_ID]) assert.equal((await fetch(base + route, { headers })).status, 400);
      assert.equal((await fetch(base + '/api/admin/not-real', { headers })).status, 404);
      assert.equal((await fetch(base + '/admin/not-real', { headers })).status, 404);
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) for (const route of ['/admin', '/api/admin/overview']) {
        assert.equal((await fetch(base + route, { method, headers })).status, 405);
        assert.equal((await fetch(base + route, { method })).status, 401);
      }
    }
    for (const injected of [{ 'X-Admin': 'true', 'X-User-Id': ADMIN_ACCOUNT_ID, 'X-Email': ADMIN_ACCOUNT_EMAIL }, { Cookie: otherCookie, 'X-Role': 'admin', 'X-Forwarded-For': '127.0.0.1' }]) {
      assert.equal((await fetch(base + '/api/admin/overview', { headers: injected })).status, 'Cookie' in injected ? 403 : 401);
    }
    for (const route of ['/api/admin/accounts', '/api/admin/audit', `/api/admin/accounts/${other}/inventory`, '/api/admin/operations/grant-points', '/api/admin/operations/revoke-points', '/api/admin/operations/grant-item', '/api/admin/operations/revoke-item', '/api/admin/operations/revoke-sessions']) {
      for (const method of ['GET', 'POST']) for (const headers of [{}, { Cookie: otherCookie }, { Authorization: `Bearer ${otherToken.accessToken}` }, { Authorization: `Bearer ${extraClaimsToken}` }, { Cookie: ownerCookie, Authorization: 'Bearer invalid' }]) {
        const response = await fetch(base + route, { method, headers });
        assert.equal(response.status, !Object.keys(headers).length || 'Authorization' in headers && headers.Authorization === 'Bearer invalid' ? 401 : 403);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
      }
    }
    assert.equal(operationCalls, 0);
    for (const route of ['accounts', 'audit']) {
      assert.equal((await fetch(base + '/api/admin/' + route, { headers: { Cookie: ownerCookie } })).status, 200);
      assert.equal((await fetch(base + '/api/admin/' + route + '?role=admin', { headers: { Cookie: ownerCookie } })).status, 400);
      assert.equal((await fetch(base + '/api/admin/' + route, { method: 'PUT', headers: { Cookie: ownerCookie } })).status, 405);
    }
    const pointsInput = { targetId: other, requestId: randomUUID(), reason: 'Isolated support fixture', points: 20 };
    const post = (body: unknown, extraHeaders: Record<string, string> = {}, route = '/api/admin/operations/grant-points') => fetch(base + route, { method: 'POST', headers: { Cookie: ownerCookie, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
    assert.equal((await post(pointsInput)).status, 403);
    assert.equal((await post(pointsInput, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await post(pointsInput, { Origin: base.replace('http:', 'https:') })).status, 403);
    assert.equal((await post(pointsInput, { Origin: base, 'Content-Type': 'text/plain' })).status, 400);
    assert.equal((await post({ ...pointsInput, points: '20' }, { Origin: base })).status, 400);
    assert.equal((await post({ ...pointsInput, state: {} }, { Origin: base })).status, 400);
    assert.equal(operationCalls, 0);
    assert.equal((await post(pointsInput, { Origin: base })).status, 200);
    assert.equal((await post(pointsInput, { Origin: base.replace('http:', 'https:'), 'X-Forwarded-Proto': 'https' })).status, 200);
    assert.equal((await post(pointsInput, { Authorization: `Bearer ${ownerToken.accessToken}` })).status, 200);
    assert.equal((await post({ ...pointsInput, requestId: randomUUID() }, { Origin: base }, '/api/admin/operations/revoke-points')).status, 200);
    const inventory = await fetch(base + `/api/admin/accounts/${other}/inventory`, { headers: { Cookie: ownerCookie } });
    assert.equal(inventory.status, 200); assert.deepEqual(await inventory.json(), { targetId: other, items: [] });
    assert.equal((await fetch(base + `/api/admin/accounts/${other}/inventory?role=admin`, { headers: { Cookie: ownerCookie } })).status, 400);
    assert.equal((await fetch(base + `/api/admin/accounts/${other}/inventory`, { method: 'PUT', headers: { Cookie: ownerCookie } })).status, 405);
    assert.equal((await post({ targetId: other, requestId: randomUUID(), reason: 'Isolated revoke fixture', itemId: 'shirt-rofinance', copies: 3 }, { Origin: base }, '/api/admin/operations/revoke-item')).status, 200);
    const beforeRate = operationCalls;
    let limited = false;
    for (let index = 0; index < 25; index++) {
      const response = await post(pointsInput, { Origin: base });
      if (response.status === 429) { assert.equal(response.headers.get('cache-control'), 'private, no-store'); limited = true; break; }
    }
    assert.ok(limited); assert.ok(operationCalls > beforeRate && operationCalls < 20);
    for (const route of ['/admin', '/api/admin/overview', '/api/%61dmin/overview']) {
      const malformed = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
      assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { error: 'INVALID_INPUT' });
      assert.equal(malformed.headers.get('cache-control'), 'private, no-store');
    }
    storedOwner = { id: ADMIN_ACCOUNT_ID, email: 'different@example.invalid' };
    assert.equal((await fetch(base + '/api/admin/overview', { headers: ownerHeaders[0] })).status, 403);
    storedOwner = null;
    assert.equal((await fetch(base + '/admin', { headers: ownerHeaders[0] })).status, 403);
    storedOwner = { id: recreated, email: ADMIN_ACCOUNT_EMAIL };
    assert.equal((await fetch(base + '/api/admin/overview', { headers: { Cookie: recreatedCookie } })).status, 403);
    storedOwner = { id: ADMIN_ACCOUNT_ID, email: ADMIN_ACCOUNT_EMAIL.toUpperCase() };
    assert.equal((await fetch(base + '/api/admin/overview', { headers: ownerHeaders[0] })).status, 200);
    sessions.get(ownerToken.id)!.revoked = true;
    assert.equal((await fetch(base + '/api/admin/overview', { headers: ownerHeaders[1] })).status, 401);
    assert.equal((await fetch(base + '/api/admin/overview', { headers: ownerHeaders[0] })).status, 200);
    unavailable = true;
    const failed = await fetch(base + '/api/admin/overview', { headers: ownerHeaders[0] }); assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { error: 'ADMIN_UNAVAILABLE' });
    unavailable = false; countsUnavailable = true;
    const noCounts = await fetch(base + '/api/admin/overview', { headers: ownerHeaders[0] }); assert.equal(noCounts.status, 503); assert.deepEqual(await noCounts.json(), { error: 'ADMIN_UNAVAILABLE' });
    assert.equal((await fetch(base + '/reports/history')).status, 200);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    pool.query = originalQuery; await pool.end(); await rm(directory, { recursive: true, force: true });
  }
});
