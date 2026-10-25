import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCommunityDesign, isCommunityPlan } from '../../shared/communityPlans';
import { hasNewDailyExpense } from '../../server/characterStore';
import { prepareCommunityFinance, publicCommunityPlan } from '../../server/communityStore';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import type { Transaction, Jar } from '../../src/types';

export const design = { title: 'Balanced living', description: 'Simple design', publicAlias: 'Creator', jars: [
  { code: 'NEC', name: 'Essentials', percentage: 60, color: '#6366f1', description: '' },
  { code: 'FUN', name: 'Fun', percentage: 40, color: '#10b981', description: '' },
] };
test('community design strictly rejects financial fields, invalid percentages, codes and public identity leakage', () => {
  assert.deepEqual(validateCommunityDesign(design), design);
  for (const value of [ { ...design, ownerId: 'forged' }, { ...design, income: 100 }, { ...design, jars: [{ ...design.jars[0], bankCode: 'TCB' }, design.jars[1]] }, { ...design, publicAlias: 'secret@example.com' }, { ...design, jars: design.jars.map(j => ({ ...j, code: 'NEC' })) }, { ...design, jars: design.jars.map(j => ({ ...j, percentage: 30 })) } ]) assert.throws(() => validateCommunityDesign(value));
  const dto = publicCommunityPlan({ id: '6a7ce8e2-8af5-4a1d-a3c3-69b769443ef3', owner_id: 'private-owner', design, active: true, adoption_count: '2' }, 'viewer');
  assert.equal(dto.isOwner, false); assert.equal(dto.adoptionCount, 2);
  assert.ok(isCommunityPlan(dto)); assert.ok(!isCommunityPlan({ ...dto, email: 'private@example.com' }));
  assert.ok(!JSON.stringify(dto).includes('private-owner'));
});
test('daily reward eligibility only new saved expenses dated today, no income/backdates/unrelated edits', () => {
  const tx: Transaction = { id: 't', type: 'expense', date: '2026-10-13', amount: 1, jarId: 'j', category: 'Food', description: '' };
  const today = '2026-10-13';
  assert.equal(hasNewDailyExpense({ transactions: [tx] }, {}, today), true);
  assert.equal(hasNewDailyExpense({ transactions: [tx] }, { transactions: [tx] }, today), false);
  assert.equal(hasNewDailyExpense({ transactions: [{ ...tx, amount: 20, description: 'edit' }] }, { transactions: [tx] }, today), false);
  for (const changed of [{ ...tx, type: 'income' as const }, { ...tx, type: 'transfer' as const }, { ...tx, date: '2026-10-12' }, { ...tx, date: '2026-10-14' }, { ...tx, amount: 0 }]) assert.equal(hasNewDailyExpense({ transactions: [changed] }, {}, today), false);
  assert.equal(hasNewDailyExpense({ transactions: [tx] }, { transactions: [{ ...tx, type: 'income' }] }, today), true);
});
test('community adoption preserves money, archives and history, only imports layout and restores configuration safely', () => {
  const base = { bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'PRIVATE', color: '#6366f1', description: '', currentSpent: 0 };
  const jars: Jar[] = [{ ...base, id: 'j-nec', code: 'NEC', name: 'Mine', percentage: 50, targetBudget: 1000, cycleAllocation: 1000 }, { ...base, id: 'j-old', code: 'OLD', name: 'Old', percentage: 50, targetBudget: 2000, cycleAllocation: 2000 }];
  const original = { jars, archivedJars: [], transactions: [], activeJarPlanId: 'custom', jarPlanSnapshots: [], bankAccounts: [], monthlyIncome: 3000 };
  const savedCopy = structuredClone(original);
  const next = prepareCommunityFinance(original, { id: '6a7ce8e2-8af5-4a1d-a3c3-69b769443ef3', design }, new Date('2026-10-13T12:00:00'));
  assert.deepEqual(original, savedCopy);
  assert.equal(next.jars.reduce((s, j) => s + j.targetBudget - j.currentSpent, 0), 3000);
  assert.equal(next.jars[0].accountNumber, '123456789'); assert.equal(next.jars[1].bankCode, '');
  assert.equal(next.archivedJars[0].id, 'j-old'); assert.deepEqual(next.transactions, []);
  assert.deepEqual(next.jarPlanSnapshots[0].jars, original.jars);
  const validation = validateAndNormalizeUserData(next, original);
  assert.ok(validation.value, validation.error);
  const again = prepareCommunityFinance(next, { id: '6a7ce8e2-8af5-4a1d-a3c3-69b769443ef3', design }, new Date('2026-10-13T12:00:00'));
  assert.equal(again.jars.reduce((s, j) => s + j.targetBudget - j.currentSpent, 0), 3000);
});
