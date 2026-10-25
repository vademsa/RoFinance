import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { createCommunityRouter } from '../../server/communityRoutes';
import { CharacterError } from '../../server/characterStore';
import type { CommunityStore } from '../../server/communityStore';
test('community routes authenticate every action, use authenticated owner and hide internal errors', async () => {
  const calls: string[] = [];
  const store = {
    list: async (owner: string) => { calls.push(owner); return { page: 1, total: 0, plans: [] }; },
    publish: async (owner: string) => { calls.push(owner); throw new CharacterError('INVALID_DESIGN'); },
    adopt: async (owner: string) => { calls.push(owner); throw new Error('PRIVATE BANK INTERNALS'); },
    unpublish: async (owner: string) => { calls.push(owner); throw new CharacterError('PLAN_NOT_FOUND', 404); },
  } as unknown as CommunityStore;
  const app = express(); app.use(express.json());
  app.use('/api/community-plans', createCommunityRouter(store, (req, res, next) => {
    if (req.get('x-test-owner') !== 'ordinary-user') { res.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    req.authUserId = 'ordinary-user'; next();
  }));
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/community-plans`;
  try {
    for (const [method, suffix] of [['GET',''], ['POST',''], ['POST','/adopt'], ['DELETE','/123']]) assert.equal((await fetch(base + suffix, { method })).status, 401);
    const headers = { 'x-test-owner': 'ordinary-user', 'X-RoFinance-Owner': 'ordinary-user', 'Content-Type': 'application/json' };
    assert.equal((await fetch(base, { headers })).status, 200);
    assert.equal((await fetch(base, { headers: { ...headers, 'X-RoFinance-Owner': 'other-user' } })).status, 401);
    assert.equal((await fetch(base, { method: 'POST', headers, body: '{}' })).status, 400);
    const failed = await fetch(base + '/adopt', { method: 'POST', headers, body: '{}' });
    assert.equal(failed.status, 500); assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await failed.json(), { error: 'COMMUNITY_UNAVAILABLE' });
    assert.equal((await fetch(base + '/123', { method: 'DELETE', headers })).status, 404);
    assert.deepEqual(calls, ['ordinary-user', 'ordinary-user', 'ordinary-user', 'ordinary-user']);
  } finally { server.close(); await once(server, 'close'); }
});
