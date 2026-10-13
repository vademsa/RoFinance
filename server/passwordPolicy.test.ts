import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import express from 'express';
import { hashPassword, validateCredentials, verifyPassword } from './auth';

test('backend registration shares the policy; existing weak password hashes can still log in', async () => {
  for (const password of ['12345678', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', 'Abc1234']) assert.ok(validateCredentials('fixture@example.test', password));
  assert.equal(validateCredentials('fixture@example.test', 'Abcdefg1'), null);
  assert.ok(validateCredentials('invalid-email', 'Abcdefg1'));
  const legacy = 'legacy123'; const hash = await hashPassword(legacy);
  assert.equal(await verifyPassword(legacy, hash), true);
  assert.equal(await verifyPassword('different', hash), false);
});
test('real mobile registration HTTP rejects weak/oversized passwords before DB writes', async () => {
  process.env.MOBILE_JWT_ACTIVE_KID = 'password-unit';
  process.env.MOBILE_JWT_KEYS = JSON.stringify({ 'password-unit': randomBytes(32).toString('base64') });
  const { default: mobileRoutes } = await import('./mobileRoutes'); const { pool } = await import('./db');
  const original = pool.query; let queries = 0;
  pool.query = (async () => { queries++; throw new Error('Unexpected database access'); }) as typeof pool.query;
  const app = express(); app.use(express.json()); app.use('/api/mobile', mobileRoutes);
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const password of ['12345678', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', 'Abc1234', 'Aa1' + 'x'.repeat(70)]) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/mobile/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fixture@example.test', password }) });
      assert.equal(response.status, 400); assert.equal((await response.json()).error, validateCredentials('fixture@example.test', password));
    }
    assert.equal(queries, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); pool.query = original; await pool.end(); }
});
