import assert from 'node:assert/strict';
import test from 'node:test';
import { nextCharacterReceipt, parseCharacterReceipt, receiptKey, type CharacterReceiptStorage } from '../../shared/characterReceipt';

test('receipts are owner scoped and contain only allowlisted action metadata', () => {
  assert.notEqual(receiptKey('owner-a'), receiptKey('owner-b'));
  const requestId = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseCharacterReceipt(JSON.stringify({ kind: 'draw', requestId })), { kind: 'draw', requestId });
  assert.deepEqual(parseCharacterReceipt(JSON.stringify({ kind: 'exchange', requestId, itemId: 'hat-gold' })), { kind: 'exchange', requestId, itemId: 'hat-gold' });
  for (const value of [null, 'broken', '{}', JSON.stringify({ kind: 'draw', requestId, points: 999 }),
    JSON.stringify({ kind: 'draw', requestId: 'bad' }), JSON.stringify({ kind: 'draw', requestId: [requestId] }), JSON.stringify({ kind: 'exchange', requestId, itemId: 'unknown' }),
    JSON.stringify({ kind: 'exchange', requestId, itemId: 'hat-basic' }),
    JSON.stringify({ kind: 'exchange', requestId, itemId: 'hat-comet' }),
    JSON.stringify({ kind: 'exchange', requestId, itemId: 'shirt-aurora' }),
    JSON.stringify({ kind: 'exchange', requestId, itemId: 'hat-celestial' }),
    JSON.stringify({ kind: 'exchange', requestId, itemId: 'backpack-orbit' })]) assert.equal(parseCharacterReceipt(value), null);
});

test('material receipts keep original copy IDs/counts for retry and reject locally forged outcome metadata', () => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  for (const kind of ['recycle', 'fuse'] as const) {
    const receipt = { kind, requestId, items: [{ itemId: 'shirt-mint', count: kind === 'recycle' ? 2 : 7 }] };
    assert.deepEqual(parseCharacterReceipt(JSON.stringify(receipt)), receipt);
    for (const key of ['points', 'itemId', 'rarity', 'userId', 'outcome']) assert.equal(parseCharacterReceipt(JSON.stringify({ ...receipt, [key]: 'forged' })), null);
    for (const count of [0, -1, '7', 0.5, 999]) assert.equal(parseCharacterReceipt(JSON.stringify({ ...receipt, items: [{ itemId: 'shirt-mint', count }] })), null);
  }
  for (const items of [[{ itemId: 'shirt-mint', count: 6 }, { itemId: 'hat-gold', count: 1 }], [{ itemId: 'hat-comet', count: 7 }], [{ itemId: 'shirt-basic', count: 7 }]]) {
    assert.equal(parseCharacterReceipt(JSON.stringify({ kind: 'fuse', requestId, items })), null);
  }
});

test('separate per-request receipts cannot erase another tab or owner pending action', async () => {
  const memory = new Map<string, string>();
  const storage: CharacterReceiptStorage = {
    keys: async () => [...memory.keys()], get: async (key) => memory.get(key) ?? null,
    set: async (key, value) => { memory.set(key, value); }, remove: async (key) => { memory.delete(key); },
  };
  const first = { kind: 'draw' as const, requestId: '11111111-1111-4111-8111-111111111111' };
  const second = { kind: 'draw' as const, requestId: '22222222-2222-4222-8222-222222222222' };
  await storage.set(receiptKey('owner-a', first.requestId), JSON.stringify(first));
  await storage.set(receiptKey('owner-a', second.requestId), JSON.stringify(second));
  await storage.set(receiptKey('owner-b', second.requestId), JSON.stringify(second));
  await storage.remove(receiptKey('owner-a', second.requestId));
  assert.deepEqual(await nextCharacterReceipt(storage, 'owner-a'), first);
  assert.deepEqual(await nextCharacterReceipt(storage, 'owner-b'), second);
  assert.equal(await nextCharacterReceipt(storage, 'owner-c'), null);
});
