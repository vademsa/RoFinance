import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jar, Transaction } from '../types';
import {
  adjustMonthlySummaryIncome,
  adjustCompletedCycleIncome,
  applyCorrectedCarryoversToCurrentJars,
  applyCurrentCycleSpending,
  createMonthlyCycleSummary,
  getBackdatableJarIds,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  getPreviousFinancialCycleStart,
  getCarryoverTotal,
  rolloverJarBalances,
  rebuildMonthlyCycleSummaries,
  setJarCycleAllocation,
  toLocalDateKey,
} from './monthlyCycle';

const jar = (id: string, currentSpent: number): Jar => ({
  id,
  code: id.toUpperCase(),
  name: id,
  percentage: 50,
  bankName: '',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  color: '#000000',
  description: '',
  targetBudget: 1_000,
  currentSpent,
});

const expense = (id: string, jarId: string, date: string, amount: number): Transaction => ({
  id,
  type: 'expense',
  amount,
  jarId,
  category: 'Test',
  date,
  description: 'Test expense',
});

const income = (id: string, date: string, amount: number): Transaction => ({
  id,
  type: 'income',
  amount,
  jarId: 'nec',
  category: 'Income',
  date,
  description: 'Test income',
});

test('a reset on day 25 starts a new cycle at local midnight', () => {
  assert.equal(
    toLocalDateKey(getFinancialCycleStart(new Date(2026, 7, 24, 23, 59), 25)),
    '2026-07-25',
  );
  assert.equal(
    toLocalDateKey(getFinancialCycleStart(new Date(2026, 7, 25, 0, 0), 25)),
    '2026-08-25',
  );
});

test('day 31 falls back to the last day of shorter months', () => {
  const februaryStart = getFinancialCycleStart(new Date(2027, 1, 28, 12), 31);
  assert.equal(toLocalDateKey(februaryStart), '2027-02-28');
  assert.equal(
    toLocalDateKey(getNextFinancialCycleStart(februaryStart, 31)),
    '2027-03-31',
  );
});

test('previous cycle start follows the configured reset-day boundaries', () => {
  assert.equal(
    toLocalDateKey(getPreviousFinancialCycleStart(new Date(2026, 8, 25, 12), 25)),
    '2026-08-25',
  );
  assert.equal(
    toLocalDateKey(getPreviousFinancialCycleStart(new Date(2026, 8, 24, 12), 25)),
    '2026-07-25',
  );
});

test('backdating requires a non-archived jar snapshot from the completed cycle', () => {
  assert.deepEqual([...getBackdatableJarIds(undefined)], []);
  assert.deepEqual([...getBackdatableJarIds({
    id: 'legacy',
    cycleStart: '2026-08-25',
    cycleEnd: '2026-09-24',
    income: 1_000,
    expense: 0,
    transactionCount: 0,
    spendingByJar: [],
    createdAt: '2026-09-25T00:00:00.000Z',
  })], []);

  const summary = createMonthlyCycleSummary(
    new Date(2026, 7, 25),
    new Date(2026, 8, 25),
    [],
    [jar('active', 0), jar('archived', 0)],
    2_000,
    new Set(['archived']),
  );
  assert.deepEqual([...getBackdatableJarIds(summary)], ['active']);
});

test('stale jar snapshots cannot restore spending from a previous cycle', () => {
  const jars = [jar('nec', 9_999), jar('play', 8_888)];
  const transactions = [
    expense('old', 'nec', '2026-08-24', 500),
    expense('current-1', 'nec', '2026-08-25', 120),
    expense('current-2', 'nec', '2026-09-01', 80),
    expense('future', 'play', '2026-09-25', 400),
  ];

  const result = applyCurrentCycleSpending(
    jars,
    transactions,
    25,
    new Date(2026, 7, 26, 12),
  );

  assert.equal(result[0].currentSpent, 200);
  assert.equal(result[1].currentSpent, 0);
});

test('a completed summary excludes transactions from the new cycle', () => {
  const jars = [jar('nec', 0)];
  const transactions = [
    expense('old', 'nec', '2026-08-24', 500),
    expense('new', 'nec', '2026-08-25', 200),
  ];
  const summary = createMonthlyCycleSummary(
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
    transactions,
    jars,
    1_000,
  );

  assert.equal(summary.expense, 500);
  assert.equal(summary.cycleEnd, '2026-08-24');
});

test('a partial income transaction does not replace the confirmed cycle income', () => {
  const summary = createMonthlyCycleSummary(
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
    [income('partial-income', '2026-08-01', 5_000_000)],
    [jar('nec', 0)],
    30_000_000,
  );

  assert.equal(summary.income, 30_000_000);
});

test('historical income corrections affect only their matching summary', () => {
  const summaries = [
    createMonthlyCycleSummary(
      new Date(2026, 6, 25),
      new Date(2026, 7, 25),
      [],
      [jar('nec', 0)],
      30_000_000,
    ),
    createMonthlyCycleSummary(
      new Date(2026, 7, 25),
      new Date(2026, 8, 25),
      [],
      [jar('nec', 0)],
      20_000_000,
    ),
  ];

  const adjusted = adjustMonthlySummaryIncome(summaries, '2026-08-10', 5_000_000);
  assert.equal(adjusted[0].income, 35_000_000);
  assert.equal(adjusted[1].income, 20_000_000);
});

test('late historical income updates its allocation, closing carryover and current jar', () => {
  const previousJar = setJarCycleAllocation(jar('nec', 0), 1_000);
  const originalTransactions = [expense('spent', 'nec', '2026-09-01', 400)];
  const originalSummary = createMonthlyCycleSummary(
    new Date(2026, 7, 25),
    new Date(2026, 8, 25),
    originalTransactions,
    [previousJar],
    1_000,
  );
  const correctedSummary = adjustCompletedCycleIncome(
    [originalSummary],
    '2026-09-10',
    500,
    [{ jarId: 'nec', amount: 500 }],
  )[0];
  const currentJar: Jar = {
    ...jar('nec', 100),
    carryovers: originalSummary.jarBreakdown?.[0].closingCarryovers,
    cycleAllocation: 300,
    targetBudget: 900,
  };
  const correctedJar = applyCorrectedCarryoversToCurrentJars(
    [currentJar],
    correctedSummary,
    [...originalTransactions, expense('current', 'nec', '2026-09-25', 100)],
    25,
    new Date(2026, 8, 25, 12),
  )[0];

  assert.equal(correctedSummary.income, 1_500);
  assert.equal(correctedSummary.jarBreakdown?.[0].cycleAllocation, 1_500);
  assert.equal(correctedSummary.jarBreakdown?.[0].availableBudget, 1_500);
  assert.equal(correctedSummary.jarBreakdown?.[0].remaining, 1_100);
  assert.equal(correctedSummary.carriedForward, 1_100);
  assert.equal(getCarryoverTotal(correctedJar), 1_100);
  assert.equal(correctedJar.cycleAllocation, 300);
  assert.equal(correctedJar.targetBudget, 1_400);
  assert.equal(correctedJar.currentSpent, 100);

  const restored = adjustCompletedCycleIncome(
    [correctedSummary],
    '2026-09-10',
    -500,
    [{ jarId: 'nec', amount: -500 }],
  )[0];
  assert.equal(restored.income, originalSummary.income);
  assert.equal(restored.jarBreakdown?.[0].cycleAllocation, 1_000);
  assert.equal(restored.jarBreakdown?.[0].remaining, 600);
});

test('rebuilding history preserves an explicit zero-income cycle', () => {
  const summary = createMonthlyCycleSummary(
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
    [],
    [jar('nec', 0)],
    0,
  );
  const rebuilt = rebuildMonthlyCycleSummaries(
    [summary],
    [],
    [jar('nec', 0)],
    30_000_000,
  );
  assert.equal(rebuilt[0].income, 0);
});

test('rebuilding history preserves archived jar rows and their real budget', () => {
  const activeJar: Jar = {
    ...jar('nec-new', 0),
    code: 'NEC',
    cycleAllocation: 700,
    transferredIn: [{
      sourceCycleStart: '2026-07-25',
      sourceCycleEnd: '2026-08-24',
      sourceJarId: 'debt-old',
      sourceJarCode: 'DEBT',
      sourceJarName: 'Trả nợ',
      amount: 300,
    }],
  };
  const archivedJar: Jar = {
    ...jar('debt-old', 200),
    code: 'DEBT',
    name: 'Trả nợ',
    cycleAllocation: 500,
    targetBudget: 500,
  };
  const transactions = [expense('old-debt-spend', archivedJar.id, '2026-08-10', 200)];
  const summary = createMonthlyCycleSummary(
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
    transactions,
    [activeJar, archivedJar],
    700,
    new Set([archivedJar.id]),
  );

  assert.equal(summary.jarBreakdown?.find((item) => item.jarId === archivedJar.id)?.availableBudget, 500);
  assert.equal(summary.jarBreakdown?.find((item) => item.jarId === archivedJar.id)?.remaining, 300);
  assert.equal(summary.carriedForward, 1_000);

  const rebuilt = rebuildMonthlyCycleSummaries(
    [summary],
    transactions,
    [activeJar],
    0,
  )[0];
  const archivedBreakdown = rebuilt.jarBreakdown?.find((item) => item.jarId === archivedJar.id);
  assert.equal(archivedBreakdown?.availableBudget, 500);
  assert.equal(archivedBreakdown?.spent, 200);
  assert.equal(archivedBreakdown?.isArchived, true);
  assert.equal(rebuilt.carriedForward, 1_000);
});

test('rollover preserves the remaining amount with source-cycle provenance', () => {
  const sourceJar: Jar = {
    ...jar('nec', 0),
    targetBudget: 1_000,
    cycleAllocation: 800,
    carryovers: [{
      sourceCycleStart: '2026-06-25',
      sourceCycleEnd: '2026-07-24',
      amount: 200,
    }],
  };
  const transactions = [expense('spent', 'nec', '2026-08-10', 300)];
  const rolled = rolloverJarBalances(
    [sourceJar],
    transactions,
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
  )[0];

  assert.equal(rolled.currentSpent, 0);
  assert.equal(rolled.cycleAllocation, 0);
  assert.equal(rolled.targetBudget, 700);
  assert.deepEqual(rolled.carryovers, [{
    sourceCycleStart: '2026-07-25',
    sourceCycleEnd: '2026-08-24',
    amount: 700,
  }]);
});

test('a new salary allocation is added on top of carried money', () => {
  const carriedJar: Jar = {
    ...jar('nec', 0),
    targetBudget: 700,
    cycleAllocation: 0,
    carryovers: [{
      sourceCycleStart: '2026-07-25',
      sourceCycleEnd: '2026-08-24',
      amount: 700,
    }],
  };
  const updated = setJarCycleAllocation(carriedJar, 500);
  assert.equal(updated.cycleAllocation, 500);
  assert.equal(getCarryoverTotal(updated), 700);
  assert.equal(updated.targetBudget, 1_200);
});

test('rollover keeps an untouched old source lot unchanged', () => {
  const sourceJar: Jar = {
    ...jar('nec', 0),
    targetBudget: 500,
    cycleAllocation: 300,
    carryovers: [{
      sourceCycleStart: '2026-06-25',
      sourceCycleEnd: '2026-07-24',
      amount: 200,
    }],
  };
  const rolled = rolloverJarBalances(
    [sourceJar],
    [],
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
  )[0];
  assert.deepEqual(rolled.carryovers, [
    {
      sourceCycleStart: '2026-06-25',
      sourceCycleEnd: '2026-07-24',
      amount: 200,
    },
    {
      sourceCycleStart: '2026-07-25',
      sourceCycleEnd: '2026-08-24',
      amount: 300,
    },
  ]);
});

test('partial spending reduces only the oldest carryover lot first', () => {
  const sourceJar: Jar = {
    ...jar('nec', 0),
    targetBudget: 500,
    cycleAllocation: 300,
    carryovers: [{
      sourceCycleStart: '2026-06-25',
      sourceCycleEnd: '2026-07-24',
      amount: 200,
    }],
  };
  const rolled = rolloverJarBalances(
    [sourceJar],
    [expense('partial', 'nec', '2026-08-01', 50)],
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
  )[0];
  assert.equal(rolled.carryovers?.[0].amount, 150);
  assert.equal(rolled.carryovers?.[1].amount, 300);
});

test('cycle summary stores historical budget and carryover details', () => {
  const sourceJar = setJarCycleAllocation({
    ...jar('nec', 0),
    carryovers: [{
      sourceCycleStart: '2026-06-25',
      sourceCycleEnd: '2026-07-24',
      amount: 200,
    }],
  }, 800);
  const summary = createMonthlyCycleSummary(
    new Date(2026, 6, 25),
    new Date(2026, 7, 25),
    [expense('spent', 'nec', '2026-08-10', 300)],
    [sourceJar],
    800,
  );
  assert.equal(summary.jarBreakdown?.[0].openingCarryover, 200);
  assert.equal(summary.jarBreakdown?.[0].cycleAllocation, 800);
  assert.equal(summary.jarBreakdown?.[0].remaining, 700);
  assert.equal(summary.carriedForward, 700);
});

test('rolling the same completed cycle twice is idempotent', () => {
  const sourceJar = setJarCycleAllocation(jar('nec', 0), 1_000);
  const transactions = [expense('spent', 'nec', '2026-08-10', 300)];
  const start = new Date(2026, 6, 25);
  const end = new Date(2026, 7, 25);
  const once = rolloverJarBalances([sourceJar], transactions, start, end);
  const twice = rolloverJarBalances(once, transactions, start, end);
  assert.deepEqual(twice, once);
});

test('a late expense corrects prior carryover without changing current-cycle spending', () => {
  const previousJar = setJarCycleAllocation(jar('nec', 0), 1_000);
  const originalTransactions = [expense('original', 'nec', '2026-09-01', 300)];
  const summary = createMonthlyCycleSummary(
    new Date(2026, 7, 25),
    new Date(2026, 8, 25),
    originalTransactions,
    [previousJar],
    1_000,
  );
  const currentJar: Jar = {
    ...jar('nec', 100),
    carryovers: summary.jarBreakdown?.[0].closingCarryovers,
    cycleAllocation: 500,
    targetBudget: 1_200,
  };
  const allTransactions = [
    ...originalTransactions,
    expense('late', 'nec', '2026-09-10', 200),
    expense('current', 'nec', '2026-09-25', 100),
  ];
  const correctedSummary = rebuildMonthlyCycleSummaries(
    [summary],
    allTransactions,
    [currentJar],
    0,
  )[0];
  const correctedJar = applyCorrectedCarryoversToCurrentJars(
    [currentJar],
    correctedSummary,
    allTransactions,
    25,
    new Date(2026, 8, 25, 12),
  )[0];

  assert.equal(correctedSummary.expense, 500);
  assert.equal(correctedSummary.carriedForward, 500);
  assert.equal(getCarryoverTotal(correctedJar), 500);
  assert.equal(correctedJar.cycleAllocation, 500);
  assert.equal(correctedJar.targetBudget, 1_000);
  assert.equal(correctedJar.currentSpent, 100);
});

test('a late expense above the old budget cannot create negative carryover', () => {
  const previousJar = setJarCycleAllocation(jar('nec', 0), 1_000);
  const summary = createMonthlyCycleSummary(
    new Date(2026, 7, 25),
    new Date(2026, 8, 25),
    [],
    [previousJar],
    1_000,
  );
  const currentJar: Jar = {
    ...jar('nec', 0),
    carryovers: summary.jarBreakdown?.[0].closingCarryovers,
    cycleAllocation: 500,
    targetBudget: 1_500,
  };
  const allTransactions = [expense('late-overrun', 'nec', '2026-09-10', 1_500)];
  const correctedSummary = rebuildMonthlyCycleSummaries(
    [summary],
    allTransactions,
    [currentJar],
    0,
  )[0];
  const correctedJar = applyCorrectedCarryoversToCurrentJars(
    [currentJar],
    correctedSummary,
    allTransactions,
    25,
    new Date(2026, 8, 25, 12),
  )[0];

  assert.equal(correctedSummary.jarBreakdown?.[0].remaining, 0);
  assert.equal(getCarryoverTotal(correctedJar), 0);
  assert.equal(correctedJar.targetBudget, 500);
});
