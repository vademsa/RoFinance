import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETICS, DRAW_COST, pointsForState } from '../../shared/character';
import { newCharacter, updateCharacter } from '../../server/characterStore';
import { applyCharacterTestGrant, applyCharacterTestSpareGrant } from '../helpers/characterTestGrant';

test('operator full collection grant adds canonical items and 999 draws without changing outfit, spending, duplicates or awards', () => {
  const state = { ...newCharacter({}, '2026-10-10'), bonusPoints: 100, spentPoints: 40, drawCount: 2, fragments: 10,
    duplicateItemCounts: { 'shirt-rose': 3 }, ownedItemIds: ['shirt-rose', ...COSMETICS.filter((item) => item.starter).map((item) => item.id)] };
  const before = structuredClone(state);
  const next = applyCharacterTestGrant(state, 999 * DRAW_COST, true);
  assert.equal(pointsForState(next).availablePoints - pointsForState(state).availablePoints, 999 * DRAW_COST);
  assert.deepEqual(new Set(next.ownedItemIds), new Set(COSMETICS.map((item) => item.id)));
  assert.equal(next.ownedItemIds.length, COSMETICS.length);
  assert.deepEqual({ ...next, bonusPoints: state.bonusPoints, ownedItemIds: state.ownedItemIds }, state);
  assert.deepEqual(state, before);
  assert.ok(COSMETICS.filter((item) => item.secret).every((item) => next.ownedItemIds.includes(item.id)));
});

test('operator grant rejects invalid credit; ordinary point grants leave ownership unchanged and HTTP profile patches cannot grant', () => {
  const state = newCharacter({}, '2026-10-10');
  assert.deepEqual(applyCharacterTestGrant(state, 20).ownedItemIds, state.ownedItemIds);
  for (const points of [0, -1, .5, NaN, 100001, Number.MAX_SAFE_INTEGER]) assert.throws(() => applyCharacterTestGrant(state, points, true), /INVALID_TEST_GRANT/);
  assert.throws(() => applyCharacterTestGrant({ ...state, bonusPoints: Number.MAX_SAFE_INTEGER }, 20), /INVALID_TEST_GRANT/);
  for (const body of [{ fullCollection: true }, { ownedItemIds: COSMETICS.map((item) => item.id) }, { bonusPoints: 999 * DRAW_COST }]) {
    assert.throws(() => updateCharacter(state, body), /INVALID_INPUT/);
  }
});

test('fusion testing adds seven spares per nonstarter item below legendary without replacing existing inventory or credit', () => {
  const state = { ...newCharacter({}, '2026-10-10'), bonusPoints: 100, spentPoints: 40, fragments: 10,
    duplicateItemCounts: { 'shirt-mint': 2, 'hat-comet': 4, 'hat-basic': 1 } };
  const before = structuredClone(state);
  const next = applyCharacterTestSpareGrant(state, 7);
  const eligible = COSMETICS.filter((item) => !item.starter && item.rarity !== 'legendary');
  assert.equal(eligible.length, 91);
  for (const item of eligible) {
    assert.equal(next.duplicateItemCounts?.[item.id], (before.duplicateItemCounts[item.id as keyof typeof before.duplicateItemCounts] ?? 0) + 7);
    assert.ok(next.ownedItemIds.includes(item.id));
  }
  assert.equal(next.duplicateItemCounts?.['hat-comet'], 4);
  assert.equal(next.duplicateItemCounts?.['hat-basic'], 1);
  assert.deepEqual({ ...next, ownedItemIds: state.ownedItemIds, duplicateItemCounts: state.duplicateItemCounts }, state);
  assert.deepEqual(state, before);
  assert.equal(pointsForState(next).availablePoints, pointsForState(state).availablePoints);
});

test('fusion test grant rejects invalid copy counts and stock overflow without mutating state', () => {
  const state = newCharacter({}, '2026-10-10');
  for (const copies of [0, -1, .5, NaN, 101, Number.MAX_SAFE_INTEGER]) assert.throws(() => applyCharacterTestSpareGrant(state, copies), /INVALID_TEST_GRANT/);
  for (const existing of [-1, .5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => applyCharacterTestSpareGrant({ ...state, duplicateItemCounts: { 'shirt-mint': existing } }, 7), /INVALID_TEST_GRANT/);
  }
  for (const patch of [{ testSpares: 7 }, { duplicateItemCounts: { 'shirt-mint': 7 } }]) assert.throws(() => updateCharacter(state, patch), /INVALID_INPUT/);
});
