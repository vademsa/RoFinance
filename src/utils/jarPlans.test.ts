import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jar, Transaction } from '../types';
import { JAR_PLAN_DEFINITIONS } from '../constants/jarPlans';
import {
  allocateWholeUnits,
  createJarPlanSnapshot,
  getJarConfigurationSignature,
  restoreMissingJarPercentages,
  switchJarPlan,
} from './jarPlans';
import { getTransferredInTotal, rolloverJarBalances } from './monthlyCycle';

const makeJar = (code: string, budget: number, spent = 0): Jar => ({
  id: `jar-${code.toLowerCase()}`,
  code,
  name: code,
  percentage: code === 'DEBT' ? 25 : 75,
  bankName: 'Chưa cấu hình',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  color: '#000000',
  description: code,
  targetBudget: budget,
  currentSpent: spent,
  cycleAllocation: budget,
  carryovers: [],
});

const expense = (jarId: string, amount: number): Transaction => ({
  id: `tx-${jarId}`,
  type: 'expense',
  amount,
  jarId,
  category: 'Test',
  date: '2026-08-28',
  description: 'Test',
  paymentMethodCode: 'CASH',
  bankName: 'Tiền mặt',
});

test('all predefined jar plans total exactly 100 percent with unique jars', () => {
  for (const plan of JAR_PLAN_DEFINITIONS) {
    assert.equal(plan.allocations.reduce((sum, item) => sum + item.percentage, 0), 100);
    assert.equal(new Set(plan.allocations.map((item) => item.code)).size, plan.allocations.length);
  }
});

test('largest remainder allocation preserves every whole VND deterministically', () => {
  assert.deepEqual(allocateWholeUnits(101, [50, 30, 20]), [51, 30, 20]);
  assert.equal(allocateWholeUnits(999, [1, 1, 1]).reduce((sum, value) => sum + value, 0), 999);
});

test('configuration signature ignores live money but preserves custom structure', () => {
  const first = makeJar('NEC', 1_000_000, 100_000);
  const sameConfig = { ...first, targetBudget: 9_000_000, currentSpent: 5_000_000 };
  const renamed = { ...sameConfig, name: 'Nhu yếu phẩm tùy chỉnh' };
  assert.equal(getJarConfigurationSignature([first]), getJarConfigurationSignature([sameConfig]));
  assert.notEqual(getJarConfigurationSignature([first]), getJarConfigurationSignature([renamed]));
});

test('switching away from DEBT transfers only its unspent amount and archives it', () => {
  const nec = makeJar('NEC', 1_000_000);
  const debt = makeJar('DEBT', 500_000, 200_000);
  const plan = {
    id: 'test-no-debt',
    name: 'No debt',
    description: '',
    suitableFor: '',
    allocations: [{ code: 'NEC', percentage: 100 }],
  };
  const result = switchJarPlan({
    currentJars: [nec, debt],
    archivedJars: [],
    targetPlan: plan,
    transactions: [expense(debt.id, 200_000)],
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  assert.equal(result.transferredAmount, 300_000);
  assert.equal(result.archivedJars[0].id, debt.id);
  assert.equal(getTransferredInTotal(result.activeJars[0]), 300_000);
  assert.equal(result.activeJars[0].targetBudget, 1_300_000);
});

test('an overspent removed jar cannot create transferable money', () => {
  const nec = makeJar('NEC', 1_000_000);
  const debt = makeJar('DEBT', 100_000, 150_000);
  const result = switchJarPlan({
    currentJars: [nec, debt],
    archivedJars: [],
    targetPlan: {
      id: 'test', name: 'Test', description: '', suitableFor: '',
      allocations: [{ code: 'NEC', percentage: 100 }],
    },
    transactions: [expense(debt.id, 150_000)],
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  assert.equal(result.transferredAmount, 0);
  assert.equal(result.activeJars[0].targetBudget, 1_000_000);
});

test('restoring a snapshot uses its structure but never restores its old money', () => {
  const oldDebt = makeJar('DEBT', 900_000);
  const snapshot = createJarPlanSnapshot([oldDebt], 'custom', 'Old custom', new Date(2026, 6, 1));
  const currentNec = makeJar('NEC', 1_000_000);
  const result = switchJarPlan({
    currentJars: [currentNec],
    archivedJars: [oldDebt],
    targetSnapshot: snapshot,
    transactions: [],
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  assert.equal(result.activeJars.length, 1);
  assert.equal(result.activeJars[0].code, 'DEBT');
  assert.notEqual(result.activeJars[0].id, oldDebt.id);
  assert.equal(result.activeJars[0].targetBudget, 1_000_000);
  assert.equal(result.transferredAmount, 1_000_000);
});

test('switching plans without removing a jar keeps its identity and live balance', () => {
  const nec = makeJar('NEC', 1_000_000, 200_000);
  const result = switchJarPlan({
    currentJars: [nec],
    archivedJars: [],
    targetPlan: {
      id: 'same', name: 'Same', description: '', suitableFor: '',
      allocations: [{ code: 'NEC', percentage: 100 }],
    },
    transactions: [expense(nec.id, 200_000)],
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  assert.equal(result.activeJars[0].id, nec.id);
  assert.equal(result.activeJars[0].targetBudget, 1_000_000);
  assert.equal(result.activeJars[0].currentSpent, 200_000);
});

test('restoring custom configuration updates metadata but keeps live money for a retained jar', () => {
  const current = makeJar('NEC', 1_000_000, 200_000);
  const custom = { ...makeJar('NEC', 9_000_000), name: 'Chi phí gia đình', percentage: 88 };
  const snapshot = createJarPlanSnapshot([custom], 'custom', 'Custom');
  const result = switchJarPlan({
    currentJars: [current],
    archivedJars: [],
    targetSnapshot: snapshot,
    transactions: [expense(current.id, 200_000)],
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  assert.equal(result.activeJars[0].id, current.id);
  assert.equal(result.activeJars[0].name, 'Chi phí gia đình');
  assert.equal(result.activeJars[0].percentage, 88);
  assert.equal(result.activeJars[0].targetBudget, 1_000_000);
  assert.equal(result.activeJars[0].currentSpent, 200_000);
});

test('repairs accidentally cleared percentages without changing live jar money', () => {
  const cleared = [
    { ...makeJar('NEC', 700), percentage: 0, cycleAllocation: 300 },
    { ...makeJar('DEBT', 500), percentage: 0, cycleAllocation: 200 },
  ];
  const repaired = restoreMissingJarPercentages(cleared, [
    { code: 'NEC', weight: 70 },
    { code: 'DEBT', weight: 30 },
  ]);

  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.jars.map((jar) => jar.percentage), [70, 30]);
  assert.deepEqual(repaired.jars.map((jar) => jar.targetBudget), [700, 500]);
  assert.deepEqual(repaired.jars.map((jar) => jar.cycleAllocation), [300, 200]);

  const unchanged = restoreMissingJarPercentages(
    [{ ...cleared[0], percentage: 100 }],
    [{ code: 'NEC', weight: 50 }],
  );
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.jars[0].percentage, 100);
});

test('monthly rollover consumes retained budget before transferred lots and preserves their source', () => {
  const nec = makeJar('NEC', 1_000_000, 200_000);
  const debt = makeJar('DEBT', 500_000, 200_000);
  const transactions = [expense(nec.id, 200_000), expense(debt.id, 200_000)];
  const switched = switchJarPlan({
    currentJars: [nec, debt],
    archivedJars: [],
    targetPlan: {
      id: 'no-debt', name: 'No debt', description: '', suitableFor: '',
      allocations: [{ code: 'NEC', percentage: 100 }],
    },
    transactions,
    resetDay: 25,
    now: new Date(2026, 7, 29),
  });
  const rolled = rolloverJarBalances(
    switched.activeJars,
    transactions,
    new Date(2026, 7, 25),
    new Date(2026, 8, 25),
  )[0];
  assert.equal(rolled.targetBudget, 1_100_000);
  const transferredLot = rolled.carryovers?.find((lot) => lot.sourceJarId === debt.id);
  assert.equal(transferredLot?.amount, 300_000);
});
