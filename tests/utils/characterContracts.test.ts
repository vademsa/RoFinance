import assert from 'node:assert/strict';
import test from 'node:test';
import { isCharacterProfile, isDrawResult, isLeaderboardEntry } from '../../src/lib/characterContracts';
import { DEFAULT_EQUIPMENT } from '../../shared/character';
import { newCharacter, privateProfile } from '../../server/characterStore';

test('profile contract rejects unusable equipment/counts/assessment without trusting successful HTTP status', () => {
  const profile = privateProfile(newCharacter({}, '2026-10-07'), {}, '2026-10-07');
  assert.equal(isCharacterProfile(profile), true);
  for (const value of [null, {}, { ...profile, ownedItemIds: null }, { ...profile, availablePoints: NaN },
    { ...profile, bonusPoints: -1 }, { ...profile, bonusPoints: '1000' }, { ...profile, bonusPoints: Infinity },
    { ...profile, equipped: { ...profile.equipped, hat: 'hat-gold' } }, { ...profile, assessment: { mood: 'bad' } }]) {
    assert.equal(isCharacterProfile(value), false);
  }
  assert.equal(isCharacterProfile({ ...profile, bonusPoints: 1000 }), true);
  assert.equal(isDrawResult({ itemId: 'hat-gold', duplicate: false, fragments: 0, guaranteed: false }), true);
  assert.equal(isDrawResult({ itemId: 'hat-gold', duplicate: true, fragments: 0, guaranteed: false }), true);
  assert.equal(isDrawResult({ itemId: 'hat-gold', duplicate: true, fragments: 5, guaranteed: false }), true);
  for (const patch of [{ duplicateItemCounts: { 'hat-gold': 7 } }, { duplicateItemCounts: { 'shirt-basic': 7 } }, { recycledPoints: -20 }, { duplicateItemCounts: 'forged' }]) assert.equal(isCharacterProfile({ ...profile, ...patch }), false);
  assert.equal(isDrawResult({ itemId: 'unknown', duplicate: true, fragments: 5, guaranteed: false }), false);
  assert.equal(isDrawResult({ itemId: null, duplicate: false, fragments: 0, guaranteed: false }), true);
  for (const patch of [{ duplicate: true }, { fragments: 5 }, { guaranteed: true }, { itemId: undefined }, { itemId: 'shirt-basic' }]) {
    assert.equal(isDrawResult({ itemId: null, duplicate: false, fragments: 0, guaranteed: false, ...patch }), false);
  }
});

test('public contract accepts legacy portraits and optional gender but excludes private financial additions', () => {
  const entry = { rank: 1, nickname: 'Public', characterId: 'leaf', equipped: DEFAULT_EQUIPMENT, score: 93 };
  assert.equal(isLeaderboardEntry(entry), true);
  assert.equal(isLeaderboardEntry({ ...entry, gender: 'female' }), true);
  assert.equal(isLeaderboardEntry({ ...entry, gender: 'male' }), true);
  assert.equal(isLeaderboardEntry({ ...entry, gender: 'forged' }), false);
  for (const key of ['userId', 'income', 'spending', 'balance', 'transactions', 'assessment', 'avatarUrl', 'email']) {
    assert.equal(isLeaderboardEntry({ ...entry, [key]: 'private' }), false);
  }
  assert.equal(isLeaderboardEntry({ ...entry, score: 101 }), false);
});
