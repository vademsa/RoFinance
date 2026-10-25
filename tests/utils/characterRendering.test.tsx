import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PixelCharacter } from '../../src/components/character/PixelCharacter';
import { CosmeticArtwork, cosmeticAura } from '../../src/components/character/CosmeticArtwork';
import { COSMETICS, DEFAULT_EQUIPMENT, ITEM_SLOTS } from '../../shared/character';

test('isolated item sprites cover the full collection with tiered aura and safe accessible titles', () => {
  for (const item of COSMETICS) {
    const html = renderToStaticMarkup(<CosmeticArtwork item={item} title={'<script>bad</script>'}/>);
    assert.match(html, new RegExp(`data-cosmetic-id="${item.id}"`));
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script|<image|https?:/);
    assert.match(html, /role="img"/);
    assert.equal(cosmeticAura(item), item.secret ? 'rainbow' : ({ common: 'neutral', rare: 'purple', special: 'gold', legendary: 'platinum' } as const)[item.rarity]);
    if (item.variant >= 5) assert.match(html, new RegExp(`data-collection-detail="${item.id}"`));
  }
});

test('reel-only sprites remove scenery and aura without changing item IDs, names or default prize effects', () => {
  for (const item of COSMETICS.filter((entry) => !entry.starter)) {
    const sprite = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en} effects={false}/>);
    assert.match(sprite, /data-effects="none"/);
    assert.match(sprite, new RegExp(`data-cosmetic-id="${item.id}"`));
    assert.match(sprite, /class="cosmetic-sprite"/);
    assert.doesNotMatch(sprite, /class="cosmetic-backdrop|class="cosmetic-aura/);
    const prize = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en}/>);
    if (item.rarity === 'legendary') assert.match(prize, /class="cosmetic-backdrop/);
    assert.match(prize, /class="cosmetic-aura/);
  }
});

test('pixel render contains all seven independent layers, safe title and no remote assets', () => {
  const html = renderToStaticMarkup(<PixelCharacter title={'<img onerror="bad">'}/>);
  for (const slot of ITEM_SLOTS) assert.match(html, new RegExp(`data-slot="${slot}"`));
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|<image|https?:|<script/);
  assert.match(html, /shape-rendering="crispEdges"/);
});

test('catalogue variants change appearance; optional accessories unequip and moods render independently', () => {
  const basic = renderToStaticMarkup(<PixelCharacter mood="happy"/>);
  for (const slot of ITEM_SLOTS) {
    for (const item of COSMETICS.filter((entry) => entry.slot === slot && !entry.starter)) {
      assert.notEqual(renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, [slot]: item.id }} mood="happy"/>), basic);
    }
  }
  const bare = renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, hat: null, backpack: null }}/>);
  assert.doesNotMatch(bare, /data-slot="hat"|data-slot="backpack"/);
  for (const mood of ['happy', 'steady', 'worried', 'attention'] as const) {
    assert.match(renderToStaticMarkup(<PixelCharacter mood={mood}/>), new RegExp(`data-mood="${mood}"`));
  }
});

test('secret cosmetics have their own pixel details and keep all existing equipment layers', () => {
  for (const [id, detail] of [['hat-comet', 'comet'], ['shirt-aurora', 'aurora'], ['backpack-orbit', 'orbit']]) {
    const item = COSMETICS.find((entry) => entry.id === id)!;
    const html = renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, [item.slot]: id }}/>);
    assert.match(html, new RegExp(`data-detail="${detail}"`));
    for (const slot of ITEM_SLOTS) assert.match(html, new RegExp(`data-slot="${slot}"`));
    assert.doesNotMatch(html, /<image|https?:|<script/);
  }
});

test('all added collections have pixel details for each slot without removing mood rendering', () => {
  for (const item of COSMETICS.filter((entry) => entry.variant >= 5)) {
    const html = renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, [item.slot]: item.id }} mood="worried"/>);
    assert.match(html, new RegExp(`data-collection-detail="${item.id}"`));
    assert.match(html, /data-mood="worried"/);
    for (const slot of ITEM_SLOTS) assert.match(html, new RegExp(`data-slot="${slot}"`));
  }
});
