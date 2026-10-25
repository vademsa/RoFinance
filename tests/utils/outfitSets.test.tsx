import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COSMETICS, DEFAULT_EQUIPMENT, ITEM_SLOTS, validateEquipment } from '../../shared/character';
import { OUTFIT_SETS, equippedOutfitSet, outfitSetOwnedCount } from '../../src/utils/outfitSets';
import { EquippedAura } from '../../src/components/character/EquippedAura';
import { OutfitSets } from '../../src/components/character/OutfitSets';
import { CharacterError, newCharacter, updateCharacter } from '../../server/characterStore';

test('every outfit set contains seven distinct canonical nonstarter items; secrets do not create partial sets', () => {
  assert.equal(OUTFIT_SETS.length, 16);
  assert.equal(new Set(OUTFIT_SETS.map((set) => set.id)).size, 16);
  for (const set of OUTFIT_SETS) {
    assert.equal(new Set(Object.values(set.items)).size, ITEM_SLOTS.length);
    for (const slot of ITEM_SLOTS) {
      const item = COSMETICS.find((entry) => entry.id === set.items[slot]);
      assert.ok(item && !item.starter && !item.secret);
      assert.equal(item.slot, slot);
    }
    assert.ok(set.vi && set.en && set.main && set.light);
  }
  assert.equal(equippedOutfitSet(DEFAULT_EQUIPMENT), undefined);
});

test('all seven matching owned items activate; missing, mixed, null, unknown or misplaced items never do', () => {
  for (const set of OUTFIT_SETS) {
    const equipped = { ...set.items };
    const owned = Object.values(equipped) as string[];
    assert.equal(equippedOutfitSet(equipped, owned)?.id, set.id);
    assert.equal(equippedOutfitSet(equipped)?.id, set.id); // Trusted public equipment.
    assert.equal(equippedOutfitSet(equipped, [])?.id, undefined);
    assert.ok(validateEquipment(equipped, owned));
    for (const slot of ITEM_SLOTS) {
      assert.equal(equippedOutfitSet(equipped, owned.filter((id) => id !== equipped[slot])), undefined);
      for (const replacement of [null, 'unknown', `${slot}-basic`, slot === 'hat' ? 'hat-comet' : 'hat-celestial']) {
        assert.equal(equippedOutfitSet({ ...equipped, [slot]: replacement }, COSMETICS.map((item) => item.id)), undefined);
      }
    }
    assert.equal(validateEquipment(equipped, owned.slice(1)), null);
    assert.equal(outfitSetOwnedCount(set, [...owned, ...owned, 'unknown']), 7);
    assert.equal(outfitSetOwnedCount(set, Array(7).fill(owned[0])), 1);
  }
});

test('all sets render bounded decorative effects alongside existing slot aura without mutating outfit/inventory', () => {
  for (const set of OUTFIT_SETS) {
    const equipped = { ...set.items };
    const owned = Object.values(equipped) as string[];
    const before = structuredClone({ equipped, owned });
    for (const size of [42, 48, 170]) {
      const html = renderToStaticMarkup(<EquippedAura equipped={equipped} ownedItemIds={owned} size={size}/>);
      assert.match(html, new RegExp(`data-outfit-set="${set.id}"`));
      assert.match(html, new RegExp(`data-set-motif="${set.motif}"`));
      assert.match(html, /viewBox="0 0 64 80" aria-hidden="true" focusable="false"/);
      assert.equal((html.match(/full-set-particle-motion/g) || []).length, 8);
      assert.doesNotMatch(html, /<script|<image|https?:|<animate|role="img"/);
    }
    const partial = renderToStaticMarkup(<EquippedAura equipped={equipped} ownedItemIds={owned.slice(1)}/>);
    assert.doesNotMatch(partial, /full-set-effect/);
    const mixed = renderToStaticMarkup(<EquippedAura equipped={{ ...equipped, shirt: 'shirt-rose' }} ownedItemIds={[...owned, 'shirt-rose']}/>);
    if (set.id !== 'rose') assert.doesNotMatch(mixed, /full-set-effect/);
    if (set.id === 'celestial') assert.match(partial, /equipped-slot-aura/); // Existing per-item aura still works.
    assert.deepEqual({ equipped, owned }, before);
  }
});

test('set completion UI is bilingual, contains only public set names and derives progress from unique owned IDs', () => {
  const set = OUTFIT_SETS.find((entry) => entry.id === 'phoenix')!;
  const owned = Object.values(set.items) as string[];
  for (const language of ['en', 'vi'] as const) {
    const html = renderToStaticMarkup(<OutfitSets equipped={{ ...set.items }} ownedItemIds={owned} language={language} disabled={false} onPreview={() => {}}/>);
    assert.match(html, language === 'en' ? /Full set effect active/ : /Hiệu ứng bộ đang bật/);
    assert.match(html, /7\/7/);
    assert.match(html, /1\/16/);
    assert.doesNotMatch(html, /Comet crown|Mũ sao chổi|Singularity|Dragon pack|setBonus|bonusPoints/);
  }
});

test('backend still checks each owned equipment ID and rejects client-assigned set/bonus fields', () => {
  const set = OUTFIT_SETS.find((entry) => entry.id === 'celestial')!;
  const state = newCharacter({}, '2026-10-10');
  const before = structuredClone(state);
  assert.throws(() => updateCharacter(state, { equipped: { ...set.items } }), (error) => error instanceof CharacterError && error.code === 'UNOWNED_EQUIPMENT');
  for (const body of [{ activeSetId: 'celestial' }, { completedSets: ['celestial'] }, { setBonusPoints: 999 }, { ownedItemIds: Object.values(set.items) }]) {
    assert.throws(() => updateCharacter(state, body), (error) => error instanceof CharacterError && error.code === 'INVALID_INPUT');
  }
  assert.deepEqual(state, before);
  const ownedState = { ...state, ownedItemIds: [...state.ownedItemIds, ...Object.values(set.items) as string[]] };
  const saved = updateCharacter(ownedState, { equipped: { ...set.items } });
  assert.equal(equippedOutfitSet(saved.equipped, saved.ownedItemIds)?.id, 'celestial');
  assert.deepEqual(saved, { ...ownedState, equipped: { ...set.items } });
});
