import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETICS, DEFAULT_EQUIPMENT, eligibleAwards, pointsForState } from '../shared/character';
import { drawCharacter, exchangeCharacter, newCharacter, privateProfile, publicRanking, updateCharacter, validateRequestId } from './characterStore';

test('new profiles are private and do not copy private names or financial fields', () => {
  const state = newCharacter({ monthlyIncome: 999999 }, '2026-10-07');
  assert.equal(state.optIn, false);
  assert.equal(state.nickname, 'Companion');
  assert.ok(!('monthlyIncome' in state));
  assert.equal(state.ownedItemIds.length, 7);
});
test('client cannot assign scores, points, inventory or out-of-list character options', () => {
  const state = newCharacter({}, '2026-10-07');
  for (const patch of [{ bonusPoints: 1000 }, { score: 100 }, { spentPoints: -100 }, { ownedItemIds: ['shirt-gold'] }, { userId: 'someone' }, { characterId: 'hacked' }, { optIn: 'true' }, { nickname: 'email@example.com' }, { nickname: '<script>' }]) {
    assert.throws(() => updateCharacter(state, patch));
  }
  assert.throws(() => updateCharacter(state, { equipped: { ...DEFAULT_EQUIPMENT, shirt: 'shirt-gold' } }));
  assert.equal(updateCharacter(state, { nickname: '  Lá  Xanh ', characterId: 'leaf', optIn: true }).nickname, 'Lá Xanh');
});
test('test credit funds draws without adding financial awards, level or ranking score', () => {
  const original = { ...newCharacter({}, '2026-10-07'), spentPoints: 40, drawCount: 2 };
  assert.equal(pointsForState(original).availablePoints, 0);
  let state = { ...original, bonusPoints: 1000 };
  for (let i = 0; i < 50; i++) state = { ...drawCharacter(state, 1895000, 0).state, bonusPoints: 1000 };
  assert.equal(state.drawCount, 52);
  assert.equal(pointsForState(state).availablePoints, 0);
  assert.throws(() => drawCharacter(state), /NOT_ENOUGH_POINTS/);
  const profile = privateProfile(state, {}, '2026-10-07');
  assert.deepEqual(profile.awards, original.awards);
  assert.equal(profile.lifetimeScore, 0);
  assert.equal(profile.level, 1);
  assert.deepEqual(profile.equipped, original.equipped);
});
test('points debit is independent of ranking, duplicate converts to fragments and spending is bounded', () => {
  const state = newCharacter({}, '2026-10-07');
  const first = drawCharacter(state, 1895000, 0);
  assert.equal(first.result.duplicate, false);
  assert.equal(first.state.spentPoints, 20);
  assert.deepEqual(first.state.awards, state.awards);
  const second = drawCharacter(first.state, 1895000, 0);
  assert.equal(second.result.duplicate, true);
  assert.equal(second.state.fragments, 0);
  assert.equal(second.state.duplicateItemCounts?.[second.result.itemId!], 1);
  assert.throws(() => drawCharacter(second.state));
  assert.equal(state.spentPoints, 0);
});
test('empty draws spend points once and preserve inventory/fragments/outfit/awards without insurance', () => {
  const original = { ...newCharacter({}, '2026-10-09'), fragments: 17, bonusPoints: 200, pityCount: 9 };
  let state = original;
  for (let i = 0; i < 9; i++) {
    const empty = drawCharacter(state, 0, 0);
    assert.deepEqual(empty.result, { itemId: null, duplicate: false, fragments: 0, guaranteed: false });
    state = { ...empty.state, bonusPoints: 200 };
    assert.equal(state.pityCount, 0);
    assert.equal(state.spentPoints, (i + 1) * 20);
    assert.equal(state.fragments, original.fragments);
    assert.deepEqual(state.ownedItemIds, original.ownedItemIds);
    assert.deepEqual(state.equipped, original.equipped);
    assert.deepEqual(state.awards, original.awards);
  }
  const tenth = drawCharacter(state, 0, 0);
  assert.equal(tenth.result.itemId, null);
  assert.equal(tenth.result.guaranteed, false);
  assert.equal(tenth.state.pityCount, 0);
});
test('exchange checks fragment balance, catalogue and ownership', () => {
  const state = { ...newCharacter({}, '2026-10-07'), fragments: 20 };
  const next = exchangeCharacter(state, 'hat-gold');
  assert.equal(next.fragments, 0);
  assert.ok(next.ownedItemIds.includes('hat-gold'));
  assert.throws(() => exchangeCharacter(next, 'hat-gold'));
  assert.throws(() => exchangeCharacter(state, 'hat-basic'));
  assert.throws(() => exchangeCharacter(state, 'not-a-real-item'));
  for (const item of COSMETICS.filter((item) => item.secret)) assert.throws(() => exchangeCharacter(state, item.id));
  for (const item of COSMETICS.filter((item) => item.rarity === 'legendary')) assert.throws(() => exchangeCharacter(state, item.id));
});
test('secret prizes use normal draw debit and duplicate fragments without changing finance or rankings', () => {
  const state = newCharacter({}, '2026-10-07');
  for (const index of [0, 1, 2, 17, 18, 19, 20]) {
    const first = drawCharacter(state, 1999965, index);
    assert.ok(COSMETICS.find((item) => item.id === first.result.itemId)?.secret);
    assert.equal(first.state.spentPoints, 20);
    assert.equal(first.state.drawCount, 1);
    assert.deepEqual(first.state.awards, state.awards);
    assert.deepEqual(first.state.equipped, state.equipped);
    const second = drawCharacter(first.state, 1999965, index);
    assert.equal(second.result.duplicate, true);
    assert.equal(second.state.spentPoints, 40);
    assert.equal(second.state.fragments, 0);
    assert.equal(second.state.duplicateItemCounts?.[first.result.itemId!], 1);
    assert.throws(() => drawCharacter(second.state, 1999965, index));
  }
  assert.equal(state.drawCount, 0);
});
test('public ranking projection drops every private field even if row contains private data', () => {
  const publicRow = publicRanking({ rank: '1', nickname: 'Alias', character_id: 'sun', equipment: DEFAULT_EQUIPMENT, score: 95,
    user_id: 'private', email: 'private@example.com', income: 123, expense: 456, bank: 'private', data: { transactions: ['private'] }, avatar_data: 'private' });
  assert.deepEqual(Object.keys(publicRow).sort(), ['rank', 'nickname', 'characterId', 'gender', 'equipped', 'score'].sort());
  assert.equal(publicRow.rank, 1);
  assert.ok(!JSON.stringify(publicRow).includes('private'));
  assert.ok(COSMETICS.length >= 28);
  assert.deepEqual(eligibleAwards({}, '2026-10-07', '2026-10-07'), {});
});
test('request id must be a UUID v4', () => {
  assert.equal(validateRequestId('B0E0B6F3-4F88-4E99-9AE0-CC9D3F1C31CB'), 'b0e0b6f3-4f88-4e99-9ae0-cc9d3f1c31cb');
  assert.throws(() => validateRequestId('owner-1'));
});
