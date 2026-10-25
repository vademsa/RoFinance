import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { createCategoryChartRouter } from '../../server/categoryChartRoutes';

test('category AI route authenticates, validates both directions, rate-limits per account and never returns upstream secrets', async () => {
  let calls = 0;
  let result: unknown = { groups: [{ name: 'Food', memberIds: ['c0', 'c1'] }] };
  const app = express(); app.use(express.json());
  app.use('/api/ai/category-groups', createCategoryChartRouter((req, res, next) => {
    if (!req.get('x-test-account')) { res.status(401).json({ error: 'AUTH' }); return; }
    req.authUserId = req.get('x-test-account'); next();
  }, async input => {
    calls++; assert.deepEqual(Object.keys(input).sort(), ['categories', 'language', 'type']);
    if (result === 'throw') throw new Error('PRIVATE_UPSTREAM_CREDENTIAL');
    return result;
  }));
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/ai/category-groups`;
  const input = { type: 'expense', language: 'en', categories: [{ id: 'c0', label: 'Breakfast' }, { id: 'c1', label: 'Lunch' }] };
  const post = (body: unknown = input, account = 'test-one') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(account ? { 'x-test-account': account } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(input, '')).status, 401); assert.equal(calls, 0);
    assert.equal((await post({ ...input, transactions: [] })).status, 400); assert.equal(calls, 0);
    const good = await post(); assert.equal(good.status, 200); assert.deepEqual(await good.json(), result);
    assert.match(good.headers.get('cache-control') || '', /no-store/);
    result = { groups: [{ name: 'Food', memberIds: ['c0', 'forged-id'] }] };
    assert.equal((await post()).status, 502);
    result = 'throw'; const unavailable = await post(); assert.equal(unavailable.status, 503);
    assert.doesNotMatch(await unavailable.text(), /PRIVATE_UPSTREAM/);
    result = { groups: [] };
    for (let index = 0; index < 6; index++) assert.equal((await post()).status, 200);
    const limited = await post(); assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error, 'CHART_AI_RATE_LIMIT');
    assert.equal((await post(input, 'test-two')).status, 200);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
