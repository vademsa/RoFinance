import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { COSMETICS, DEFAULT_EQUIPMENT, getDrawPool, pointsForState, type CharacterState, type ItemMaterial } from '../shared/character';
import { CharacterStore, drawCharacter, newCharacter, transformDuplicates, updateCharacter, validateMaterials } from './characterStore';

const seeded = (): CharacterState => ({ ...newCharacter({}, '2026-10-09'), fragments: 31, spentPoints: 40,
  ownedItemIds: [...newCharacter({}, '2026-10-09').ownedItemIds, 'shirt-mint', 'hat-mint', 'hat-gold'],
  equipped: { ...DEFAULT_EQUIPMENT, shirt: 'shirt-mint' }, duplicateItemCounts: { 'shirt-mint': 7, 'hat-mint': 3, 'hat-gold': 7 } });
test('duplicate wins preserve their server-selected ID and add one spare, without legacy fragments or ranking changes', () => {
  const state = { ...seeded(), bonusPoints: 20 };
  const next = drawCharacter(state, 1300000, 0);
  assert.equal(next.result.itemId, 'shirt-mint');
  assert.equal(next.result.duplicate, true);
  assert.equal(next.result.fragments, 0);
  assert.equal(next.state.duplicateItemCounts?.['shirt-mint'], 8);
  assert.equal(next.state.fragments, 31);
  assert.deepEqual(next.state.equipped, state.equipped);
  assert.deepEqual(next.state.awards, state.awards);
});
test('exactly two spare copies yield one draw of credit while originals, outfits, old fragments and test credit stay intact', () => {
  const state = seeded();
  const { state: next, result } = transformDuplicates(state, 'recycle', [{ itemId: 'shirt-mint', count: 1 }, { itemId: 'hat-mint', count: 1 }]);
  assert.equal(result.points, 20);
  assert.equal(result.itemId, null);
  assert.equal(next.recycledPoints, 20);
  assert.equal(pointsForState(next).availablePoints, 20);
  assert.equal(next.duplicateItemCounts?.['shirt-mint'], 6);
  assert.equal(next.duplicateItemCounts?.['hat-mint'], 2);
  for (const field of ['ownedItemIds', 'equipped', 'awards', 'fragments', 'bonusPoints', 'spentPoints', 'drawCount'] as const) assert.deepEqual(next[field], state[field]);
  const drawn = drawCharacter(next, 0);
  assert.equal(pointsForState(drawn.state).availablePoints, 0);
  assert.throws(() => drawCharacter(drawn.state), /NOT_ENOUGH_POINTS/);
});
test('all next-tier IDs, including secrets, are reachable and cannot be supplied as outcomes by the client', () => {
  for (const [input, tier] of [['shirt-mint', 'rare'], ['shirt-rose', 'special'], ['hat-gold', 'legendary']] as const) {
    const state = { ...seeded(), ownedItemIds: [...new Set([...seeded().ownedItemIds, input])], duplicateItemCounts: { [input]: 7 } };
    const pool = getDrawPool(tier);
    for (let index = 0; index < pool.length; index++) {
      const { state: next, result } = transformDuplicates(state, 'fuse', [{ itemId: input, count: 7 }], index);
      assert.equal(result.itemId, pool[index].id);
      assert.equal(result.points, 0);
      assert.equal(next.duplicateItemCounts?.[input], undefined);
      assert.ok(next.ownedItemIds.includes(pool[index].id));
      assert.deepEqual(next.equipped, state.equipped);
      assert.equal(next.spentPoints, state.spentPoints);
      assert.deepEqual(next.awards, state.awards);
    }
    assert.throws(() => transformDuplicates(state, 'fuse', [{ itemId: input, count: 7 }], pool.length), /INVALID_ITEM/);
  }
});
test('same-color fusion permits mixed IDs but not mixed rarity, and duplicate output grants exactly one spare', () => {
  const state = { ...seeded(), ownedItemIds: [...seeded().ownedItemIds, 'shirt-rose'] };
  const { state: next, result } = transformDuplicates(state, 'fuse', [{ itemId: 'shirt-mint', count: 4 }, { itemId: 'hat-mint', count: 3 }], 0);
  assert.equal(result.itemId, 'shirt-rose');
  assert.equal(result.duplicate, true);
  assert.equal(next.duplicateItemCounts?.['shirt-rose'], 1);
  assert.equal(next.duplicateItemCounts?.['shirt-mint'], 3);
  assert.deepEqual(next.ownedItemIds, state.ownedItemIds);
  assert.throws(() => transformDuplicates(state, 'fuse', [{ itemId: 'shirt-mint', count: 6 }, { itemId: 'hat-gold', count: 1 }]), /MIXED_RARITY/);
  assert.throws(() => transformDuplicates(state, 'fuse', [{ itemId: 'hat-comet', count: 7 }]), /MAX_RARITY/);
});
test('forged quantities, unknown/starter IDs, repeated entries, extra properties and missing ownership fail closed without mutating inventory', () => {
  const state = seeded(); const before = structuredClone(state);
  for (const value of [null, [], {}, [{ itemId: 'shirt-mint', count: 1 }], [{ itemId: 'shirt-mint', count: 3 }],
    ...[0, -2, 0.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER].map((count) => [{ itemId: 'shirt-mint', count }]),
    [{ itemId: 'shirt-basic', count: 2 }], [{ itemId: 'unknown', count: 2 }],
    [{ itemId: 'shirt-mint', count: 1 }, { itemId: 'shirt-mint', count: 1 }],
    [{ itemId: 'shirt-mint', count: 2, rarity: 'legendary' }]]) assert.throws(() => transformDuplicates(state, 'recycle', value));
  for (const copies of [undefined, 1, '7', -1, 0.5, NaN]) assert.throws(() => transformDuplicates({ ...state, duplicateItemCounts: { 'shirt-mint': copies } as any }, 'recycle', [{ itemId: 'shirt-mint', count: 2 }]));
  assert.throws(() => transformDuplicates({ ...state, ownedItemIds: [] }, 'recycle', [{ itemId: 'shirt-mint', count: 2 }]), /NOT_ENOUGH_DUPLICATES/);
  assert.deepEqual(state, before);
});
test('legacy profiles do not synthesize duplicate copies or recycling credit from old fragments', () => {
  const state = { ...newCharacter({}, '2026-10-09'), fragments: 1000 };
  assert.throws(() => transformDuplicates(state, 'recycle', [{ itemId: 'shirt-mint', count: 2 }]), /NOT_ENOUGH_DUPLICATES/);
  assert.equal(pointsForState(state).availablePoints, 40);
  assert.equal(state.fragments, 1000);
});
test('all points, spare counts and outcome fields are rejected by profile and action allowlists before database access', () => {
  const state = seeded(); const store = new CharacterStore(null as any);
  for (const patch of [{ recycledPoints: 1000 }, { duplicateItemCounts: { 'hat-gold': 7 } }, { fragments: 1000 }, { ownedItemIds: ['hat-comet'] }]) assert.throws(() => updateCharacter(state, patch));
  for (const kind of ['draw', 'recycle', 'fuse'] as const) {
    const input = kind === 'draw' ? { requestId: randomUUID() } : { requestId: randomUUID(), items: [{ itemId: 'shirt-mint', count: kind === 'fuse' ? 7 : 2 }] };
    for (const key of ['itemId', 'result', 'rarity', 'points', 'ownerId', 'userId', 'roll', 'itemIndex', 'duplicateItemCounts']) assert.throws(() => store.action('owner', kind, { ...input, [key]: 'forged' }), /INVALID_INPUT/);
  }
  const first: ItemMaterial[] = [{ itemId: 'shirt-mint', count: 1 }, { itemId: 'hat-mint', count: 1 }];
  assert.deepEqual(validateMaterials('recycle', first), validateMaterials('recycle', [...first].reverse()));
});
