import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COSMETICS, ITEM_SLOTS, DEFAULT_EQUIPMENT, canExchangeCosmetic, getDrawPool, selectDrawItem, type Equipment } from '../../shared/character';
import { newCharacter, transformDuplicates, updateCharacter } from '../../server/characterStore';
import { cosmeticHonour, cosmeticTheme } from './cosmeticPresentation';
import { equippedOutfitSet } from './outfitSets';
import { CosmeticArtwork } from '../components/character/CosmeticArtwork';
import { CosmeticCard } from '../components/character/CosmeticCard';
import { PixelCharacter } from '../components/character/PixelCharacter';
import { EquippedAura } from '../components/character/EquippedAura';

const signature = COSMETICS.filter(item => item.exclusive);
const outfit = Object.fromEntries(signature.map(item => [item.slot, item.id])) as Equipment;

test('seven unique canonical Signature items stay in the legendary server pool, never in fragment exchange or starter ownership', () => {
  assert.equal(signature.length, 7);
  assert.deepEqual(new Set(signature.map(item => item.slot)), new Set(ITEM_SLOTS));
  const state = newCharacter({}, '2026-10-11');
  const pool = getDrawPool('legendary');
  for (const item of signature) {
    assert.equal(item.id, `${item.slot}-rofinance`);
    assert.equal(item.rarity, 'legendary');
    assert.equal(canExchangeCosmetic(item), false);
    assert.equal(state.ownedItemIds.includes(item.id), false);
    assert.equal(selectDrawItem(1999965, pool.findIndex(entry => entry.id === item.id), 0).item?.id, item.id);
    const materials = { ...state, ownedItemIds: [...state.ownedItemIds, 'shirt-gold'], duplicateItemCounts: { 'shirt-gold': 7 } };
    assert.equal(transformDuplicates(materials, 'fuse', [{ itemId: 'shirt-gold', count: 7 }], pool.findIndex(entry => entry.id === item.id)).result.itemId, item.id);
  }
  assert.throws(() => updateCharacter(state, { equipped: outfit }), /UNOWNED_EQUIPMENT/);
  assert.throws(() => updateCharacter(state, { exclusive: true, ownedItemIds: Object.values(outfit) }), /INVALID_INPUT/);
});

test('Signature R, tailoring, scenery and exclusive title are consistent across isolated items and dressed characters', () => {
  for (const item of signature) {
    assert.equal(cosmeticTheme(item), 'signature');
    const art = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en}/>);
    assert.match(art, /data-theme="signature"/);
    assert.match(art, /data-signature-logo="R"/);
    assert.match(art, new RegExp(`data-collection-detail="${item.id}"`));
    const reelArt = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en} effects={false}/>);
    assert.match(reelArt, /data-effects="none"/);
    assert.doesNotMatch(reelArt, /cosmetic-backdrop|cosmetic-aura/);
    for (const language of ['vi', 'en'] as const) {
      const card = renderToStaticMarkup(<CosmeticCard item={item} language={language} className="reward-prize">{item.en}</CosmeticCard>);
      assert.match(card, /data-exclusive="true"/);
      assert.match(card, language === 'en' ? /RoFinance exclusive/ : /Độc quyền RoFinance/);
      assert.match(card, new RegExp(cosmeticHonour(item, language)));
    }
  }
  const character = renderToStaticMarkup(<PixelCharacter equipped={outfit}/>);
  assert.equal((character.match(/data-signature-detail=/g) || []).length, 7);
  assert.equal((character.match(/data-signature-logo="R"/g) || []).length, 7);
});

test('Signature set effect requires exactly seven owned/equipped items; previews cannot award money or points', () => {
  const owned = Object.values(outfit) as string[];
  const before = structuredClone({ owned, outfit });
  assert.equal(equippedOutfitSet(outfit, owned)?.id, 'rofinance');
  assert.equal(equippedOutfitSet(outfit, owned.slice(1)), undefined);
  assert.equal(equippedOutfitSet({ ...outfit, hat: DEFAULT_EQUIPMENT.hat }, owned), undefined);
  const html = renderToStaticMarkup(<EquippedAura equipped={outfit} ownedItemIds={owned}/>);
  assert.match(html, /data-outfit-set="rofinance"/);
  assert.match(html, /data-set-motif="signature"/);
  assert.match(html, /data-signature-logo="R"/);
  assert.doesNotMatch(html, /<animate|<image|https?:|bonusPoints|income|balance/);
  assert.deepEqual({ owned, outfit }, before);
});
