import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_JARS } from '../../src/constants/defaultData';
import type { DebtItem } from '../../src/types';
import { createDebtAllocationProposal } from '../../src/utils/debtAllocation';
import { recalculateJarsWithDebt } from '../../src/utils/debtCalculator';

const jars = () => DEFAULT_JARS.map(jar => ({ ...jar, cycleAllocation: jar.percentage * 100_000,
  targetBudget: jar.percentage * 100_000 + 12345, currentSpent: 321,
  carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 12345 }] }));
const debt = (payment: number, status: DebtItem['status'] = 'active'): DebtItem => ({
  id: 'debt', name: 'Synthetic debt', status, monthlyPayment: payment, totalAmount: payment * 12,
  remainingAmount: status === 'paid' ? 0 : payment * 12, startMonth: '2026-01-01', endMonth: '2026-12-31',
});

test('paid debts release only into selected jars without mutating inputs, carryovers or recorded spending', () => {
  const current = jars(), original = structuredClone(current);
  const result = createDebtAllocationProposal(current, [debt(1_000_000, 'paid')], 10_000_000,
    { strategy: 'PROPORTIONAL', affectedJarCodes: ['SAFE', 'EDU', 'PLAY'] });
  assert.ok(result.jars);
  assert.deepEqual(current, original);
  assert.deepEqual(result.jars.map(jar => jar.id), current.map(jar => jar.id));
  assert.equal(result.jars.find(jar => jar.code === 'DEBT')!.percentage, 0);
  for (const code of ['NEC', 'GIVE', 'FFA']) assert.equal(result.jars.find(jar => jar.code === code)!.percentage, current.find(jar => jar.code === code)!.percentage);
  for (const jar of result.jars) {
    assert.deepEqual(jar.carryovers, original.find(item => item.id === jar.id)!.carryovers);
    assert.equal(jar.currentSpent, 321);
  }
  assert.equal(result.jars.reduce((sum, jar) => sum + Math.round(jar.percentage * 100), 0), 10000);
});

test('remaining debts retain sufficient funding, including fractional percentages', () => {
  const result = createDebtAllocationProposal(jars(), [debt(8684163)], 30_000_000,
    { strategy: 'PROPORTIONAL', affectedJarCodes: ['SAFE', 'FFA', 'EDU', 'PLAY'] });
  assert.ok(result.jars);
  const reserved = result.jars.find(jar => jar.code === 'DEBT')!;
  assert.equal(reserved.percentage, 28.95);
  assert.ok(reserved.cycleAllocation! >= 8684163);
});

test('zero income, empty selections, impossible locks and missing DEBT cannot erase existing rates', () => {
  const current = jars();
  assert.deepEqual(recalculateJarsWithDebt(current, [], 0), current);
  assert.deepEqual(createDebtAllocationProposal(current, [], 0, {}), { error: 'income' });
  assert.deepEqual(createDebtAllocationProposal(current, [], 10_000_000, { affectedJarCodes: [] }), { error: 'selection' });
  assert.deepEqual(createDebtAllocationProposal(current, [], 10_000_000, { affectedJarCodes: ['forged'] }), { error: 'selection' });
  assert.deepEqual(createDebtAllocationProposal(current.filter(jar => jar.code !== 'DEBT'), [], 10_000_000, {}), { error: 'selection' });
  assert.deepEqual(createDebtAllocationProposal(current, [], 10_000_000, { fixedAmounts: { GIVE: 20_000_000 } }), { error: 'fixed' });
  assert.equal(createDebtAllocationProposal(current, [debt(7_000_000)], 10_000_000,
    { affectedJarCodes: ['PLAY'] }).error, 'shortfall');
  assert.equal(createDebtAllocationProposal(current, [], 10_000_000,
    { affectedJarCodes: ['PLAY'], fixedAmounts: { GIVE: 9_000_000 } }).error, 'fixed');
});

test('fixed GIVE amount remains exact and custom codes participate without predefined code assumptions', () => {
  const current = jars().map(jar => jar.code === 'EDU' ? { ...jar, code: 'TRAVEL' } : jar);
  const result = createDebtAllocationProposal(current, [], 10_000_000,
    { affectedJarCodes: ['TRAVEL', 'PLAY'], fixedAmounts: { GIVE: 123456 } });
  assert.ok(result.jars);
  assert.equal(result.jars.find(jar => jar.code === 'GIVE')!.cycleAllocation, 123456);
  assert.equal(result.jars.find(jar => jar.code === 'GIVE')!.percentage, 1.23);
  assert.ok(result.jars.find(jar => jar.code === 'TRAVEL')!.percentage > 10);
});
