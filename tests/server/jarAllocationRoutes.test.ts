import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { createJarAllocationRouter } from '../../server/jarAllocationRoutes';
import { parseJarAllocationRequest, parseJarAllocationSuggestion, buildJarAllocationSuggestion } from '../../shared/jarAllocation';

const input = { language: 'en', jars: [{ code: 'NEC', percentage: 40 }, { code: 'DEBT', percentage: 20 },
  { code: 'SAFE', percentage: 10 }, { code: 'CUSTOM', percentage: 30 }], editableCodes: ['SAFE', 'CUSTOM'] };
const output = { weights: [{ code: 'SAFE', weight: 3 }, { code: 'CUSTOM', weight: 1 }], reason: 'Synthetic draft' };

test('AI boundary accepts only a bounded percentage draft, no private finances or unexpected editable IDs', () => {
  assert.ok(parseJarAllocationRequest(input));
  for (const invalid of [null, { ...input, monthlyIncome: 1000 }, { ...input, bankAccounts: [] },
    { ...input, editableCodes: ['DEBT'] }, { ...input, editableCodes: ['forged'] }, { ...input, editableCodes: ['SAFE', 'SAFE'] },
    { ...input, editableCodes: [] }, { ...input, language: 'fr' }, { ...input, jars: [] },
    { ...input, jars: [...input.jars, input.jars[0]] },
    { ...input, jars: input.jars.map(jar => ({ ...jar, accountNumber: 'private' })) },
    { ...input, jars: input.jars.map(jar => ({ ...jar, percentage: 0 })) },
    { ...input, jars: input.jars.map(jar => jar.code === 'SAFE' ? { ...jar, percentage: 10.001 } : jar) },
    { ...input, jars: input.jars.map(jar => jar.code === 'CUSTOM' ? { ...jar, code: '__proto__' } : jar) },
  ]) assert.equal(parseJarAllocationRequest(invalid), null);
});

test('normalization totals exactly 100 percent while preserving debt and locks; malformed AI drafts are rejected', () => {
  const parsed = parseJarAllocationRequest(input)!;
  const good = buildJarAllocationSuggestion(output, parsed)!;
  assert.deepEqual(good.allocation, { NEC: 40, DEBT: 20, SAFE: 30, CUSTOM: 10 });
  assert.ok(parseJarAllocationSuggestion(good, parsed));
  assert.equal(parseJarAllocationSuggestion({ ...good, allocation: { ...good.allocation, DEBT: 0, SAFE: 50 } }, parsed), null);
  assert.equal(parseJarAllocationSuggestion({ ...good, allocation: { ...good.allocation, forged: 0 } }, parsed), null);
  for (const weights of [[], [{ code: 'SAFE', weight: 1 }, { code: 'SAFE', weight: 1 }],
    [{ code: 'SAFE', weight: 1 }, { code: 'DEBT', weight: 1 }],
    [{ code: 'SAFE', weight: 0 }, { code: 'CUSTOM', weight: 0 }],
    [{ code: 'SAFE', weight: -1 }, { code: 'CUSTOM', weight: 1 }],
    [{ code: 'SAFE', weight: Infinity }, { code: 'CUSTOM', weight: 1 }],
    [{ code: 'SAFE', weight: '3' }, { code: 'CUSTOM', weight: 1 }],
  ]) assert.equal(buildJarAllocationSuggestion({ ...output, weights }, parsed), null);
  for (let index = 1; index < 100; index++) {
    const result = buildJarAllocationSuggestion({ ...output, weights: [{ code: 'SAFE', weight: index }, { code: 'CUSTOM', weight: 3 }] }, parsed)!;
    assert.equal(Object.values(result.allocation).reduce((sum, value) => sum + Math.round(value * 100), 0), 10000);
    assert.equal(result.allocation.DEBT, 20); assert.equal(result.allocation.NEC, 40);
  }
});

test('allocation endpoint authenticates, validates, isolates limits per user and does not expose upstream errors', async () => {
  let calls = 0;
  let result: unknown = output;
  const app = express(); app.use(express.json());
  app.use('/api/ai/jar-allocation', createJarAllocationRouter((req, res, next) => {
    const owner = req.get('x-test-account');
    if (!owner) { res.status(401).json({ error: 'AUTH' }); return; }
    req.authUserId = owner; next();
  }, async payload => {
    calls++; assert.deepEqual(Object.keys(payload).sort(), ['editableCodes', 'jars', 'language']);
    if (result === 'throw') throw new Error('PRIVATE_PROVIDER_SECRET');
    return result;
  }));
  const server = http.createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const post = (body: unknown = input, owner = 'one') => fetch(`http://127.0.0.1:${address.port}/api/ai/jar-allocation`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(owner ? { 'x-test-account': owner } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(input, '')).status, 401); assert.equal(calls, 0);
    assert.equal((await post({ ...input, bankAccounts: [] })).status, 400); assert.equal(calls, 0);
    const response = await post(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.ok(parseJarAllocationSuggestion(await response.json(), parseJarAllocationRequest(input)!));
    result = { ...output, weights: [{ code: 'DEBT', weight: 100 }] }; assert.equal((await post()).status, 502);
    result = 'throw'; const failed = await post(); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /PRIVATE_PROVIDER/);
    result = output;
    for (let index = 0; index < 6; index++) assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
    assert.equal((await post(input, 'two')).status, 200);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
