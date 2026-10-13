import assert from 'node:assert/strict';
import test from 'node:test';
import { pointsForState, WELCOME_POINTS } from '../shared/character';
import { drawCharacter, newCharacter, privateProfile, updateCharacter } from './characterStore';
import { isCharacterProfile } from '../src/lib/characterContracts';

test('revocation ledger survives draws/profile edits and future credits without rewriting awards or spending', () => {
  const state = { ...newCharacter({}, '2026-10-11'), bonusPoints: 100, spentPoints: 20, revokedPoints: 60 };
  assert.equal(pointsForState(state).availablePoints, WELCOME_POINTS + 20);
  const drawn = drawCharacter(state, 0).state;
  assert.equal(drawn.revokedPoints, 60); assert.equal(drawn.spentPoints, 40); assert.deepEqual(drawn.awards, state.awards);
  assert.equal(pointsForState(drawn).availablePoints, WELCOME_POINTS);
  assert.equal(updateCharacter(state, { nickname: 'New name' }).revokedPoints, 60);
  assert.throws(() => updateCharacter(state, { revokedPoints: 0 }), /INVALID_INPUT/);
  assert.equal(pointsForState({ ...state, bonusPoints: 120 }).availablePoints, WELCOME_POINTS + 40);
  assert.equal(pointsForState({ ...state, recycledPoints: 20 }).availablePoints, WELCOME_POINTS + 40);
  const profile = privateProfile(state, {}, '2026-10-11'); assert.ok(isCharacterProfile(profile));
  for (const revokedPoints of [-1, 1.5, '60', Number.MAX_SAFE_INTEGER + 1]) assert.equal(isCharacterProfile({ ...profile, revokedPoints }), false);
  assert.equal(privateProfile({ ...state, revokedPoints: 0 }, {}, '2026-10-11').lifetimeScore, profile.lifetimeScore);
});
