import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COSMETICS, DEFAULT_EQUIPMENT } from '../../shared/character';
import { cosmeticAura, cosmeticHonour, cosmeticTheme, equippedAuraItem, equippedAuraItems, equippedLegendary, themeColors } from './cosmeticPresentation';
import { CosmeticArtwork } from '../components/character/CosmeticArtwork';
import { EquippedAura } from '../components/character/EquippedAura';

test('every legendary has matching scenery and every cosmetic has bilingual cosmetic-only titles', () => {
  for (const item of COSMETICS) {
    assert.ok(cosmeticHonour(item, 'vi').length > 0);
    assert.ok(cosmeticHonour(item, 'en').length > 0);
    if (item.rarity !== 'legendary') { assert.equal(cosmeticTheme(item), 'plain'); continue; }
    const theme = cosmeticTheme(item);
    assert.notEqual(theme, 'plain');
    assert.ok(themeColors[theme].every((color) => /^#[\da-f]{6}$/i.test(color)));
    const html = renderToStaticMarkup(React.createElement(CosmeticArtwork, { item, title: item.en }));
    assert.match(html, /class="cosmetic-backdrop"/);
    assert.match(html, new RegExp(`data-theme="${theme}"`));
    assert.doesNotMatch(html, /<script|<image|https?:/);
  }
  assert.equal(cosmeticTheme(COSMETICS.find((item) => item.id === 'shirt-phoenix')!), 'phoenix');
  assert.equal(cosmeticTheme(COSMETICS.find((item) => item.id === 'shirt-eclipse')!), 'eclipse');
});

test('equipped background reflects previewed legendary equipment without changing inventory or scores', () => {
  assert.equal(equippedLegendary(DEFAULT_EQUIPMENT), undefined);
  const equipment = { ...DEFAULT_EQUIPMENT, shirt: 'shirt-phoenix', hat: 'hat-comet' };
  assert.equal(equippedLegendary(equipment)?.id, 'hat-comet');
  assert.equal(equippedLegendary({ ...equipment, hat: null })?.id, 'shirt-phoenix');
  assert.deepEqual(equipment, { ...DEFAULT_EQUIPMENT, shirt: 'shirt-phoenix', hat: 'hat-comet' });
});

test('equipped aura uses the highest canonical, correctly slotted rarity and disappears with basic equipment', () => {
  assert.equal(equippedAuraItem(DEFAULT_EQUIPMENT), undefined);
  assert.equal(renderToStaticMarkup(React.createElement(EquippedAura, { equipped: DEFAULT_EQUIPMENT })), '');
  for (const [rarity, aura] of [['rare', 'purple'], ['special', 'gold'], ['legendary', 'platinum']] as const) {
    const item = COSMETICS.find((entry) => entry.rarity === rarity && !entry.secret)!;
    const equipment = { ...DEFAULT_EQUIPMENT, [item.slot]: item.id };
    const before = structuredClone(equipment);
    assert.equal(equippedAuraItem(equipment)?.id, item.id);
    assert.equal(cosmeticAura(item), aura);
    const html = renderToStaticMarkup(React.createElement(EquippedAura, { equipped: equipment }));
    assert.match(html, new RegExp(`data-aura="${aura}"`));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /cosmetic-aura-halo/);
    assert.match(html, /cosmetic-aura-rays/);
    assert.match(html, /cosmetic-aura-orbit/);
    assert.doesNotMatch(html, /role="img"|<script|<image|https?:/);
    assert.deepEqual(equipment, before);
  }
  const mixed = { ...DEFAULT_EQUIPMENT, shirt: 'shirt-phoenix', hat: 'hat-comet' };
  assert.equal(cosmeticAura(equippedAuraItem(mixed)!), 'rainbow');
  assert.equal(cosmeticAura(equippedAuraItem({ ...mixed, hat: null })!), 'platinum');
  assert.equal(equippedAuraItem({ ...DEFAULT_EQUIPMENT, shirt: 'hat-comet', hat: 'unknown' }), undefined);
});

test('each equipped slot has an independent local effect; shoes only glow without a floor aura', () => {
  const equipment = { ...DEFAULT_EQUIPMENT, hat: 'hat-comet', shirt: 'shirt-phoenix', shoes: 'shoes-gold' };
  assert.deepEqual(new Set(equippedAuraItems(equipment).map((item) => item.id)), new Set(['hat-comet', 'shirt-phoenix', 'shoes-gold']));
  const html = renderToStaticMarkup(React.createElement(EquippedAura, { equipped: equipment, size: 48 }));
  assert.match(html, /width:48px;height:60px/);
  for (const slot of ['hat', 'shirt', 'shoes']) assert.match(html, new RegExp(`data-slot="${slot}"`));
  const shoesOnly = renderToStaticMarkup(React.createElement(EquippedAura, { equipped: { ...DEFAULT_EQUIPMENT, shoes: 'shoes-gold' } }));
  assert.equal((shoesOnly.match(/equipped-local-glow/g) || []).length, 2);
  assert.doesNotMatch(shoesOnly, /cosmetic-aura-rays|cosmetic-aura-orbit|cosmetic-backdrop/);
});
