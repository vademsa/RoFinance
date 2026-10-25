import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacterApi, CharacterApiError } from '../../src/lib/characterApi';
import { newCharacter, privateProfile } from '../../server/characterStore';

test('character adapter uses platform transport, same request ID, bounded request and no owner/points fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createCharacterApi(async (url, init) => {
    calls.push({ url: String(url), init });
    const state = newCharacter({}, '2026-10-07'); state.ownedItemIds.push('hat-gold');
    const profile = privateProfile(state, {}, '2026-10-07');
    return Response.json({ profile, result: { itemId: 'hat-gold', duplicate: false, fragments: 0, guaranteed: false }, season: '2026-10', entries: [] });
  });
  await client.draw('existing-request-id'); await client.draw('existing-request-id');
  await client.exchange('exchange-id', 'hat-gold');
  await client.leaderboard('2026-10');
  assert.equal(calls[0].url, '/api/character/draw');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { requestId: 'existing-request-id' });
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { requestId: 'exchange-id', itemId: 'hat-gold' });
  assert.ok(calls.every((call) => call.init.signal));
  assert.equal(calls[3].url, '/api/character/leaderboard?season=2026-10');
});

test('material transport sends only receipt and materials, and rejects switched IDs, wrong-tier or unowned output', async () => {
  const state = newCharacter({}, '2026-10-09'); state.ownedItemIds.push('shirt-rose');
  const profile = privateProfile(state, {}, '2026-10-09');
  const items = [{ itemId: 'shirt-mint', count: 7 }];
  const result = { kind: 'fuse', consumed: items, points: 0, itemId: 'shirt-rose', duplicate: false };
  let sent: RequestInit | undefined;
  const client = createCharacterApi(async (url, init) => { assert.equal(url, '/api/character/fuse'); sent = init; return Response.json({ profile, result }); });
  await client.transform('fuse', 'receipt', items);
  assert.deepEqual(JSON.parse(String(sent?.body)), { requestId: 'receipt', items });
  for (const patch of [{ itemId: 'hat-comet' }, { points: 999 }, { consumed: [{ itemId: 'hat-mint', count: 7 }] }, { itemId: 'shirt-mint' }]) {
    const malformed = createCharacterApi(async () => Response.json({ profile, result: { ...result, ...patch } }));
    await assert.rejects(() => malformed.transform('fuse', 'receipt', items), /CHARACTER_UNAVAILABLE/);
  }
  const switched = createCharacterApi(async () => Response.json({ profile, result: { itemId: 'shirt-rose' } }));
  await assert.rejects(() => switched.exchange('receipt', 'hat-gold'), /CHARACTER_UNAVAILABLE/);
});

test('server errors are typed and malformed responses become recoverable unavailable errors', async () => {
  const rejected = createCharacterApi(async () => Response.json({ error: 'UNOWNED_EQUIPMENT' }, { status: 400 }));
  await assert.rejects(() => rejected.update({ equipped: null }), (error) => error instanceof CharacterApiError && error.code === 'UNOWNED_EQUIPMENT' && error.status === 400);
  const unavailable = createCharacterApi(async () => new Response('upstream unavailable', { status: 502 }));
  await assert.rejects(() => unavailable.profile(), (error) => error instanceof CharacterApiError && error.code === 'CHARACTER_UNAVAILABLE');
  const malformed = createCharacterApi(async () => Response.json({ profile: {} }));
  await assert.rejects(() => malformed.profile(), (error) => error instanceof CharacterApiError && error.code === 'CHARACTER_UNAVAILABLE' && error.status === 0);
});

test('stale or offline release blocks point requests without changing their receipt; retry sends the same UUID', async () => {
  let blocked = true; let calls = 0;
  const state = newCharacter({}, '2026-10-07');
  const client = createCharacterApi(async (_url, init) => {
    calls++; assert.equal(init?.cache, 'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)), { requestId: 'original-receipt' });
    return Response.json({ profile: privateProfile(state, {}, '2026-10-07'), result: { itemId: null, duplicate: false, fragments: 0, guaranteed: false } });
  }, async () => { if (blocked) throw new Error('APP_UPDATE_REQUIRED'); });
  await assert.rejects(() => client.draw('original-receipt'), (e) => e instanceof CharacterApiError && e.code === 'APP_UPDATE_REQUIRED');
  await assert.rejects(() => client.exchange('original-receipt', 'hat-gold'), /APP_UPDATE_REQUIRED/);
  await assert.rejects(() => client.transform('recycle', 'original-receipt', [{ itemId: 'shirt-mint', count: 2 }]), /APP_UPDATE_REQUIRED/);
  await assert.rejects(() => client.transform('fuse', 'original-receipt', [{ itemId: 'shirt-mint', count: 7 }]), /APP_UPDATE_REQUIRED/);
  assert.equal(calls, 0);
  blocked = false; await client.draw('original-receipt'); assert.equal(calls, 1);
});

test('unavailable version check fails closed before sending a point action', async () => {
  let calls = 0;
  const client = createCharacterApi(async () => { calls++; return Response.json({}); }, async () => { throw new Error('offline'); });
  await assert.rejects(() => client.draw('original-receipt'), (e) => e instanceof CharacterApiError && e.code === 'CHARACTER_UNAVAILABLE');
  assert.equal(calls, 0);
});
