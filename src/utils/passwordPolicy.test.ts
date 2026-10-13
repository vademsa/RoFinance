import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordPolicyError } from '../../shared/passwordPolicy';
import { activateCharacterEnrollment, newCharacter, updateCharacter } from '../../server/characterStore';

test('registration password policy: uppercase/lowercase/digit, Unicode, length, byte cap and controls', () => {
  for (const value of [null, {}, 12345678, '', 'Abc1234', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', '12345678']) assert.ok(passwordPolicyError(value));
  for (const value of ['Abcdefg1', 'Đẹp12345', 'Aa1' + 'x'.repeat(69), 'Aa1' + 'é'.repeat(34) + 'x']) assert.equal(passwordPolicyError(value), null);
  for (const value of ['Aa1' + 'x'.repeat(70), 'Aa1' + 'é'.repeat(35), 'Aa1234😀', 'Abcdef1\n', 'Abcdef1\u0000']) assert.ok(passwordPolicyError(value));
});
test('admin gifts keep enrollment dormant; activation rebases once without dropping gifts or equipment', () => {
  const state = { ...newCharacter({}, '2026-01-01'), pendingEnrollment: true, bonusPoints: 100, duplicateItemCounts: { 'shirt-rofinance': 6 } };
  const next = activateCharacterEnrollment(state, { preferences: { monthlyResetDay: 25 } }, '2026-10-11', new Date('2026-10-11T00:00:00Z'));
  assert.equal(next.enrolledCycleStart, '2026-09-25'); assert.equal(next.pendingEnrollment, undefined);
  assert.equal(next.bonusPoints, 100); assert.deepEqual(next.duplicateItemCounts, state.duplicateItemCounts); assert.deepEqual(next.equipped, state.equipped);
  assert.equal(activateCharacterEnrollment(next, {}, '2026-11-11'), next);
  assert.throws(() => updateCharacter(state, { pendingEnrollment: false }), /INVALID_INPUT/);
});
