import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import pg from 'pg';
import { CHARACTER_SCHEMA_SQL } from '../../server/characterSchema';
import { CharacterStore } from '../../server/characterStore';
import { createCharacterRouter } from '../../server/characterRoutes';

test('isolated HTTP/auth: real requireAuth accepts signed web sessions and mobile JWTs, rejects spoofing/revocation',
  { skip: !process.env.CHARACTER_TEST_DATABASE_URL }, async () => {
    const schema = `rf_character_test_${randomBytes(8).toString('hex')}`;
    const admin = new pg.Pool({ connectionString: process.env.CHARACTER_TEST_DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
    let database: pg.Pool | null = null;
    let authPool: pg.Pool | null = null;
    let server: http.Server | null = null;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      const isolatedUrl = new URL(process.env.CHARACTER_TEST_DATABASE_URL!);
      isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
      // Modules are imported only after the test pool has an isolated search_path.
      process.env.DATABASE_URL = isolatedUrl.toString();
      process.env.MOBILE_JWT_KEYS = JSON.stringify({ test: randomBytes(32).toString('base64') });
      process.env.MOBILE_JWT_ACTIVE_KID = 'test';
      const dbModule = await import('../../server/db');
      authPool = dbModule.pool;
      database = authPool;
      await database.query(`CREATE TABLE users (id UUID PRIMARY KEY);
        CREATE TABLE user_data (user_id UUID PRIMARY KEY REFERENCES users(id), data JSONB NOT NULL);
        CREATE TABLE mobile_sessions (id UUID PRIMARY KEY, user_id UUID REFERENCES users(id),
          expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ)`);
      await database.query(CHARACTER_SCHEMA_SQL);
      const owner = randomUUID(); const other = randomUUID(); const sessionId = randomUUID();
      await database.query('INSERT INTO users(id) VALUES($1),($2)', [owner, other]);
      await database.query("INSERT INTO mobile_sessions(id,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')", [sessionId, owner]);
      const { issueMobileAccessToken } = await import('../../server/mobileJwt');
      const { requireAuth } = await import('../../server/auth');
      const access = await issueMobileAccessToken(owner, sessionId);
      const app = express();
      app.use(express.json());
      // A signed in-memory test session exercises the real cookie branch without touching public.user_sessions.
      app.use(session({ secret: randomBytes(32).toString('hex'), resave: false, saveUninitialized: false }));
      app.post('/fixture-login', (req, res) => { req.session.userId = owner; res.json({ ok: true }); });
      app.use('/api/character', createCharacterRouter(new CharacterStore(database), requireAuth));
      server = http.createServer(app).listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address(); assert(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      for (const path of ['profile', 'leaderboard', 'draw', 'exchange', 'recycle', 'fuse']) {
        assert.equal((await fetch(`${base}/api/character/${path}`, { method: ['draw', 'exchange', 'recycle', 'fuse'].includes(path) ? 'POST' : 'GET' })).status, 401);
      }
      const login = await fetch(`${base}/fixture-login`, { method: 'POST' });
      const cookie = login.headers.get('set-cookie')!.split(';')[0];
      const mobileHeaders = { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' };
      const webHeaders = { Cookie: cookie, 'Content-Type': 'application/json' };
      const web = await fetch(`${base}/api/character/profile`, { headers: webHeaders });
      const mobile = await fetch(`${base}/api/character/profile`, { headers: mobileHeaders });
      assert.equal(web.status, 200); assert.equal(mobile.status, 200);
      assert.deepEqual(await web.json(), await mobile.json());
      const requestId = randomUUID();
      const draw = await fetch(`${base}/api/character/draw`, { method: 'POST', headers: mobileHeaders, body: JSON.stringify({ requestId }) });
      const retry = await fetch(`${base}/api/character/draw`, { method: 'POST', headers: webHeaders, body: JSON.stringify({ requestId }) });
      assert.equal(draw.status, 200); assert.equal(retry.status, 200);
      assert.deepEqual(await draw.json(), await retry.json());
      assert.equal((await new CharacterStore(database).profile(owner)).spentPoints, 20);
      assert.equal((await new CharacterStore(database).profile(other)).spentPoints, 0);
      for (const headers of [mobileHeaders, webHeaders]) {
        const updated = await fetch(`${base}/api/character/profile`, { method: 'PATCH', headers, body: JSON.stringify({ gender: 'female' }) });
        assert.equal(updated.status, 200); assert.equal((await updated.json() as any).profile.gender, 'female');
        assert.equal((await new CharacterStore(database).profile(other)).gender, 'male');
        for (const body of [{ gender: 'admin' }, { gender: null }, { gender: 'female', userId: other }]) assert.equal((await fetch(`${base}/api/character/profile`, { method: 'PATCH', headers, body: JSON.stringify(body) })).status, 400);
        for (const kind of ['recycle', 'fuse']) {
          const input = { requestId: randomUUID(), items: [{ itemId: 'shirt-mint', count: kind === 'recycle' ? 2 : 7 }] };
          for (const key of ['userId', 'ownerId', 'itemId', 'rarity', 'points', 'result']) assert.equal((await fetch(`${base}/api/character/${kind}`, { method: 'POST', headers, body: JSON.stringify({ ...input, [key]: other }) })).status, 400);
          assert.equal((await fetch(`${base}/api/character/${kind}`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 409);
        }
      }
      assert.equal((await fetch(`${base}/api/character/profile?userId=${other}`, { headers: mobileHeaders })).status, 400);
      assert.equal((await fetch(`${base}/api/character/profile?cycleStart=`, { headers: mobileHeaders })).status, 400);
      assert.equal((await fetch(`${base}/api/character/profile`, { method: 'PATCH', headers: mobileHeaders,
        body: JSON.stringify({ userId: other, nickname: 'Hijacked' }) })).status, 400);
      assert.equal((await fetch(`${base}/api/character/profile`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
      assert.equal((await fetch(`${base}/api/character/fuse`, { method: 'POST', headers: { ...webHeaders, Authorization: 'Bearer invalid' }, body: '{}' })).status, 401);
      await database.query('UPDATE mobile_sessions SET revoked_at=NOW() WHERE id=$1', [sessionId]);
      assert.equal((await fetch(`${base}/api/character/profile`, { headers: mobileHeaders })).status, 401);
      assert.equal((await fetch(`${base}/api/character/profile`, { headers: webHeaders })).status, 200);
    } finally {
      if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server!.close(() => resolve())); }
      if (authPool) await authPool.end();
      if (/^rf_character_test_[0-9a-f]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
