import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newCharacter, privateProfile } from '../../server/characterStore';
import { materialCopies, changeWorkshopQuantity, workshopMaterials } from '../../src/utils/materialWorkshop';

function fixture() {
  const state = newCharacter({}, '2026-10-10');
  state.ownedItemIds.push('shirt-mint', 'hat-mint', 'shirt-rose', 'hat-phoenix');
  state.duplicateItemCounts = { 'shirt-mint': 9, 'hat-mint': 3, 'shirt-rose': 2, 'hat-phoenix': 7 };
  return privateProfile(state, {}, '2026-10-10');
}
test('basket is bounded to seven same-tier spare copies and excludes originals, unowned or fabricated counts', () => {
  const profile = fixture();
  const basket = workshopMaterials(profile, 'fuse', 'common', { 'shirt-mint': 5, 'hat-mint': 3, 'shirt-rose': 2, 'shirt-basic': 999, 'hat-gold': 7 });
  assert.deepEqual(basket, [{ itemId: 'shirt-mint', count: 5 }, { itemId: 'hat-mint', count: 2 }]);
  assert.equal(materialCopies(basket).length, 7);
  assert.deepEqual(workshopMaterials(profile, 'fuse', 'legendary', { 'hat-phoenix': 7 }), []);
  for (const invalid of [NaN, Infinity, 1.5, -2]) assert.deepEqual(workshopMaterials(profile, 'fuse', 'common', { 'shirt-mint': invalid }), []);
  assert.equal(profile.duplicateItemCounts['shirt-mint'], 9);
});
test('adding/removing a copy preserves the rest of the basket, availability and the global limit', () => {
  const profile = fixture();
  let quantities = changeWorkshopQuantity(profile, 'fuse', 'common', {}, 'shirt-mint', 5);
  quantities = changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'hat-mint', 99);
  assert.deepEqual(workshopMaterials(profile, 'fuse', 'common', quantities), [{ itemId: 'shirt-mint', count: 5 }, { itemId: 'hat-mint', count: 2 }]);
  quantities = changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'shirt-mint', 4);
  quantities = changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'hat-mint', 3);
  assert.equal(materialCopies(workshopMaterials(profile, 'fuse', 'common', quantities)).length, 7);
  assert.deepEqual(changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'shirt-rose', 1), quantities);
  assert.deepEqual(changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'shirt-basic', 1), quantities);
  profile.duplicateItemCounts['shirt-mint'] = 1;
  assert.equal(workshopMaterials(profile, 'fuse', 'common', quantities)[0].count, 1);
  const displayedCount = workshopMaterials(profile, 'fuse', 'common', quantities).find((entry) => entry.itemId === 'shirt-mint')!.count;
  quantities = changeWorkshopQuantity(profile, 'fuse', 'common', quantities, 'shirt-mint', displayedCount - 1);
  assert.equal(workshopMaterials(profile, 'fuse', 'common', quantities).some((entry) => entry.itemId === 'shirt-mint'), false);
});
test('recycling accepts mixed-tier spares but caps the basket to exactly two without changing inventory', () => {
  const profile = fixture(), before = structuredClone(profile);
  let quantities = changeWorkshopQuantity(profile, 'recycle', 'common', {}, 'shirt-mint', 1);
  quantities = changeWorkshopQuantity(profile, 'recycle', 'common', quantities, 'hat-phoenix', 1);
  const basket = workshopMaterials(profile, 'recycle', 'common', quantities);
  assert.deepEqual(basket, [{ itemId: 'shirt-mint', count: 1 }, { itemId: 'hat-phoenix', count: 1 }]);
  assert.equal(materialCopies(basket).length, 2); assert.deepEqual(profile, before);
});
