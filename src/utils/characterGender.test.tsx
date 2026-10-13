import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHARACTERS, COSMETICS, cosmeticGender, DEFAULT_EQUIPMENT, DRAW_TICKETS, NO_PRIZE_TICKETS, ITEM_SLOTS, validateEquipment } from '../../shared/character';
import { newCharacter, privateProfile, updateCharacter, drawCharacter, publicRanking } from '../../server/characterStore';
import { isCharacterProfile, isLeaderboardEntry } from '../lib/characterContracts';
import { PixelCharacter } from '../components/character/PixelCharacter';
import { CosmeticArtwork } from '../components/character/CosmeticArtwork';

test('gender changes preserve legacy ownership, equipment, credits, awards and draw history; invalid enum/extra keys are rejected', () => {
  const state = { ...newCharacter({}, '2026-10-11'), bonusPoints: 100, revokedPoints: 10, spentPoints: 20 };
  const { gender: _gender, ...legacy } = state;
  assert.equal(privateProfile(legacy, {}, '2026-10-11').gender, 'male');
  assert.ok(isCharacterProfile({ ...privateProfile(legacy, {}, '2026-10-11'), gender: undefined }));
  for (const gender of ['female', 'male'] as const) {
    const next = updateCharacter(legacy, { gender });
    assert.deepEqual(next, { ...legacy, gender });
    assert.equal(privateProfile(next, {}, '2026-10-11').availablePoints, privateProfile(legacy, {}, '2026-10-11').availablePoints);
    assert.equal(drawCharacter(next, 0).state.gender, gender);
  }
  for (const gender of [null, '', 'Female', 'unisex', 'admin', 1, ['female'], {}, undefined]) {
    assert.throws(() => updateCharacter(legacy, { gender }), /INVALID_GENDER/);
    assert.equal(isCharacterProfile({ ...privateProfile(state, {}, '2026-10-11'), gender }), gender === undefined);
  }
  assert.throws(() => updateCharacter(state, { gender: 'female', ownedItemIds: ['shirt-female-classic'] }), /INVALID_INPUT/);
  assert.throws(() => updateCharacter(state, { gender: 'female', equipped: { ...state.equipped, shirt: 'shirt-female-classic' } }), /UNOWNED_EQUIPMENT/);
});

test('gender styles have unique canonical IDs and shared sprite/outfit artwork; ownership is required, mixing remains allowed', () => {
  const legacy = COSMETICS.filter(item => item.variant < 20);
  assert.ok(legacy.every(item => cosmeticGender(item) === 'unisex'));
  for (const gender of ['male', 'female'] as const) {
    const items = COSMETICS.filter(item => item.gender === gender);
    assert.equal(items.length, 7); assert.deepEqual(items.map(item => item.slot), [...ITEM_SLOTS]);
    const equipment = Object.fromEntries(items.map(item => [item.slot, item.id])) as typeof DEFAULT_EQUIPMENT;
    assert.ok(validateEquipment(equipment, items.map(item => item.id)));
    const state = { ...newCharacter({}, '2026-10-11'), ownedItemIds: [...legacy.filter(item => item.starter).map(item => item.id), ...items.map(item => item.id)] };
    assert.deepEqual(updateCharacter(state, { gender: gender === 'female' ? 'male' : 'female', equipped: equipment }).ownedItemIds, state.ownedItemIds);
    for (const item of items) {
      const artwork = renderToStaticMarkup(<CosmeticArtwork item={item} title={item.en}/>);
      assert.match(artwork, new RegExp(`data-clothing-gender="${gender}"`));
      assert.match(artwork, new RegExp(`data-collection-detail="${item.id}"`));
    }
    const portrait = renderToStaticMarkup(<PixelCharacter gender={gender} equipped={equipment}/>);
    assert.match(portrait, new RegExp(`data-gender="${gender}"`));
  }
  const male = renderToStaticMarkup(<PixelCharacter gender="male"/>); const female = renderToStaticMarkup(<PixelCharacter gender="female"/>);
  assert.notEqual(male, female); assert.match(female, /female-base-hair/); assert.doesNotMatch(male, /female-base-hair/);
  assert.equal(DRAW_TICKETS, 2000000); assert.equal(NO_PRIZE_TICKETS, 1300000);
});

test('public gender is cosmetic only and projection/contract do not expose private data', () => {
  const row = publicRanking({ rank: 1, nickname: 'Alias', gender: 'female', character_id: 'sun', equipment: DEFAULT_EQUIPMENT, score: 95, email: 'private', income: 999 });
  assert.equal(row.gender, 'female'); assert.ok(isLeaderboardEntry(row));
  assert.deepEqual(Object.keys(row).sort(), ['rank', 'nickname', 'characterId', 'gender', 'equipped', 'score'].sort());
  assert.equal(publicRanking({ ...row, gender: 'forged' }).gender, 'male');
});

test('female face and hair change immediately with every equipped head style while preserving cosmetics and moods', () => {
  for (const character of CHARACTERS) for (const mood of ['happy', 'steady', 'worried', 'attention'] as const) {
    for (const item of COSMETICS.filter(item => ['hair', 'face', 'hat'].includes(item.slot))) {
      const equipment = { ...DEFAULT_EQUIPMENT, [item.slot]: item.id };
      const before = structuredClone(equipment);
      const female = renderToStaticMarkup(<PixelCharacter gender="female" characterId={character.id} equipped={equipment} mood={mood}/>);
      const male = renderToStaticMarkup(<PixelCharacter gender="male" characterId={character.id} equipped={equipment} mood={mood}/>);
      for (const detail of ['female-base-hair', 'female-front-hair', 'female-face']) {
        assert.match(female, new RegExp(`data-gender-detail="${detail}"`));
        assert.doesNotMatch(male, new RegExp(`data-gender-detail="${detail}"`));
      }
      assert.match(female, /data-base-face="female"/);
      assert.match(male, /data-base-face="male"/);
      assert.match(female, new RegExp(`data-mood="${mood}"`));
      if (item.variant >= 5) assert.match(female, new RegExp(`data-collection-detail="${item.id}"`));
      assert.deepEqual(equipment, before);
      assert.notEqual(female, male);
    }
  }
});
