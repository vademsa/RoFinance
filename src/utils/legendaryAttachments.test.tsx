import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COSMETICS, DEFAULT_EQUIPMENT, ITEM_SLOTS } from '../../shared/character';
import { attachmentViewBox, legendaryAttachment } from './legendaryAttachments';
import { LegendaryAttachmentArtwork } from '../components/character/LegendaryAttachment';
import { CosmeticArtwork } from '../components/character/CosmeticArtwork';
import { PixelCharacter } from '../components/character/PixelCharacter';
import { EquippedAura } from '../components/character/EquippedAura';

const expected = {
  'backpack-celestial': 'angel-wings', 'backpack-phoenix': 'phoenix-wings',
  'backpack-orbit': 'orbital-wings', 'backpack-dragon': 'dragon-wings',
  'hat-celestial': 'angel-halo', 'hat-phoenix': 'phoenix-halo',
  'hat-comet': 'comet-halo', 'hat-singularity': 'singularity-halo',
};

test('attachment designs only upgrade eight existing legendary IDs in their original slots', () => {
  const before = structuredClone(COSMETICS);
  assert.equal(COSMETICS.filter((item) => legendaryAttachment(item)).length, 8);
  for (const item of COSMETICS) {
    assert.equal(legendaryAttachment(item), expected[item.id as keyof typeof expected]);
    if (!legendaryAttachment(item)) assert.equal(attachmentViewBox(item), undefined);
  }
  const angel = COSMETICS.find((item) => item.id === 'backpack-celestial')!;
  assert.equal(legendaryAttachment({ ...angel, slot: 'hat' }), undefined);
  assert.equal(legendaryAttachment({ ...angel, rarity: 'common' }), undefined);
  assert.equal(legendaryAttachment({ ...angel, id: 'unknown' }), undefined);
  assert.equal(legendaryAttachment(undefined), undefined);
  assert.deepEqual(COSMETICS, before);
});

test('catalogue, reel and equipped portraits share exactly the same themed attachment artwork', () => {
  const silhouettes: string[] = [];
  for (const [id, shape] of Object.entries(expected)) {
    const item = COSMETICS.find((entry) => entry.id === id)!;
    const art = renderToStaticMarkup(<LegendaryAttachmentArtwork item={item}/>);
    const card = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en}/>);
    const portrait = renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, [item.slot]: id }}/>);
    assert.ok(card.includes(art));
    assert.ok(portrait.includes(art));
    assert.match(art, new RegExp(`data-attachment="${shape}"`));
    assert.match(card, new RegExp(`viewBox="${attachmentViewBox(item)}"`));
    assert.doesNotMatch(art, /<script|<image|https?:|<animate/);
    if (shape.endsWith('wings')) {
      assert.match(art, /data-wing="left"/);
      assert.match(art, /data-wing="right" transform="translate\(64 0\) scale\(-1 1\)"/);
    } else assert.doesNotMatch(art, /data-wing=/);
    silhouettes.push(art);
  }
  assert.equal(new Set(silhouettes).size, 8);
});

test('wings sit behind the character, halo replaces the old hat and mood/other equipment remain intact', () => {
  const equipped = { ...DEFAULT_EQUIPMENT, backpack: 'backpack-celestial', hat: 'hat-celestial' };
  const before = structuredClone(equipped);
  for (const mood of ['happy', 'steady', 'worried', 'attention'] as const) {
    const html = renderToStaticMarkup(<PixelCharacter equipped={equipped} mood={mood}/>);
    assert.ok(html.indexOf('data-attachment="angel-wings"') < html.indexOf('data-slot="shirt"'));
    assert.ok(html.indexOf('data-attachment="angel-wings"') < html.indexOf('data-slot="face"'));
    assert.match(html, new RegExp(`data-mood="${mood}"`));
    for (const slot of ITEM_SLOTS) assert.equal((html.match(new RegExp(`data-slot="${slot}"`, 'g')) || []).length, 1);
    assert.doesNotMatch(html, /<rect x="16" y="42" width="9" height="20"/); // No old backpack behind wings.
    assert.doesNotMatch(html, /<rect x="23" y="15" width="20" height="7"/); // No hat under halo.
  }
  const bare = renderToStaticMarkup(<PixelCharacter equipped={{ ...equipped, hat: null, backpack: null }}/>);
  assert.doesNotMatch(bare, /data-attachment=|data-slot="hat"|data-slot="backpack"/);
  const misplaced = renderToStaticMarkup(<PixelCharacter equipped={{ ...DEFAULT_EQUIPMENT, hat: 'backpack-celestial', backpack: 'hat-celestial' }}/>);
  assert.doesNotMatch(misplaced, /data-attachment=/);
  assert.deepEqual(equipped, before);
});

test('wing aura expands behind both wings without moving head or shoe effects', () => {
  const html = renderToStaticMarkup(<EquippedAura size={64} equipped={{ ...DEFAULT_EQUIPMENT, backpack: 'backpack-dragon', hat: 'hat-comet', shoes: 'shoes-gold' }}/>);
  assert.match(html, /data-slot="backpack"[^>]+left:0;top:22px;width:64px;height:48px/);
  assert.match(html, /data-slot="hat"[^>]+left:10px;top:-2px;width:46px;height:32px/);
  assert.match(html, /data-slot="shoes"[^>]+left:18px;top:64px;width:31px;height:15px/);
});
