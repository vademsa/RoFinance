import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jar, MonthlyCycleSummary, Transaction } from '../types';
import { buildAnalyticsCycles, getCategoryTotals, getRecentCycleTotals } from './analytics';

const jar: Jar = {
  id: 'nec',
  code: 'NEC',
  name: 'Thiết yếu',
  percentage: 100,
  bankName: '',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  color: '#22c55e',
  description: '',
  targetBudget: 6_000,
  cycleAllocation: 5_000,
  carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 1_000 }],
  currentSpent: 0,
};

const transaction = (id: string, type: Transaction['type'], date: string, value: number, category: string): Transaction => ({
  id,
  type,
  date,
  amount: value,
  category,
  jarId: 'nec',
  description: '',
});

const summary: MonthlyCycleSummary = {
  id: '2026-08-25',
  cycleStart: '2026-08-25',
  cycleEnd: '2026-09-24',
  income: 7_000,
  expense: 1_000,
  transactionCount: 1,
  spendingByJar: [{ jarId: 'nec', amount: 1_000 }],
  jarBreakdown: [{
    jarId: 'nec',
    jarCode: 'NEC',
    jarName: 'Thiết yếu',
    openingCarryover: 500,
    cycleAllocation: 9_000,
    availableBudget: 9_500,
    spent: 1_000,
    remaining: 8_500,
    closingCarryovers: [],
  }],
  carriedForward: 8_500,
  createdAt: '2026-09-25T00:00:00.000Z',
};

test('analytics uses financial-cycle boundaries and historical budgets without counting transfers as expenses', () => {
  const transactions = [
    transaction('old-expense', 'expense', '2026-09-24', 1_000, 'Ăn uống'),
    transaction('new-expense', 'expense', '2026-09-25', 800, 'Cà phê'),
    transaction('transfer', 'transfer', '2026-09-26', 2_000, 'Chuyển hũ'),
  ];
  const cycles = buildAnalyticsCycles({
    jars: [jar],
    jarRegistry: [jar],
    transactions,
    summaries: [summary],
    monthlyIncome: 5_000,
    resetDay: 25,
    now: new Date(2026, 8, 28),
  });

  assert.equal(cycles.length, 2);
  assert.deepEqual([cycles[0].start, cycles[0].end, cycles[0].budget, cycles[0].expense],
    ['2026-08-25', '2026-09-24', 9_500, 1_000]);
  assert.deepEqual([cycles[1].start, cycles[1].end, cycles[1].budget, cycles[1].expense],
    ['2026-09-25', '2026-10-24', 6_000, 800]);
  assert.equal(cycles[1].net, 4_200);
  assert.equal(cycles[1].carryover, 5_200);
  assert.equal(cycles[1].jars[0].spent, 800);
  assert.equal(cycles[1].jars[0].closingCarryovers[0].amount, 200);
});

test('old summaries without jar snapshots do not borrow the current jar budget', () => {
  const cycles = buildAnalyticsCycles({
    jars: [jar],
    jarRegistry: [jar],
    transactions: [],
    summaries: [{ ...summary, jarBreakdown: undefined, carriedForward: undefined }],
    monthlyIncome: 5_000,
    resetDay: 25,
    now: new Date(2026, 8, 28),
  });
  assert.equal(cycles[0].budget, null);
  assert.equal(cycles[0].carryover, null);
  assert.equal(cycles[0].jars[0].budget, null);
});

test('recent-cycle totals and income categories use only recorded transaction types', () => {
  const transactions = [
    transaction('income-1', 'income', '2026-09-25', 2_000, 'Lương'),
    transaction('income-2', 'income', '2026-09-26', 500, 'Làm thêm'),
    transaction('expense', 'expense', '2026-09-27', 300, 'Ăn uống'),
    transaction('transfer', 'transfer', '2026-09-27', 900, 'Chuyển hũ'),
  ];
  assert.deepEqual(getCategoryTotals(transactions, 'income').map((item) => [item.name, item.amount]), [
    ['Lương', 2_000],
    ['Làm thêm', 500],
  ]);
  const cycles = buildAnalyticsCycles({
    jars: [jar],
    jarRegistry: [jar],
    transactions,
    summaries: [summary],
    monthlyIncome: 5_000,
    resetDay: 25,
    now: new Date(2026, 8, 28),
  });
  assert.deepEqual(getRecentCycleTotals(cycles), {
    cycles,
    income: 12_000,
    expense: 1_300,
    net: 10_700,
    averageExpense: 650,
    retentionRate: 10_700 / 12_000,
  });
});

test('completed-cycle trend follows detailed expenses when a saved summary is stale', () => {
  const previousExpense = transaction('old-expense', 'expense', '2026-09-01', 1_000, 'Ăn uống');
  const build = (value: number) => buildAnalyticsCycles({
    jars: [jar],
    jarRegistry: [jar],
    transactions: [{ ...previousExpense, amount: value }],
    summaries: [summary],
    monthlyIncome: 0,
    resetDay: 25,
    now: new Date(2026, 8, 28),
  })[0];

  const increased = build(2_500);
  assert.equal(increased.income, 7_000);
  assert.equal(increased.expense, 2_500);
  assert.equal(increased.net, 4_500);
  assert.equal(increased.jars[0].spent, 2_500);
  assert.equal(increased.jars[0].remaining, 7_000);

  const reduced = build(500);
  assert.equal(reduced.expense, 500);
  assert.equal(reduced.net, 6_500);
});

test('completed-cycle trend retains a historical total when transaction details are incomplete', () => {
  const cycles = buildAnalyticsCycles({
    jars: [jar],
    jarRegistry: [jar],
    transactions: [transaction('one-of-two', 'expense', '2026-09-01', 300, 'Ăn uống')],
    summaries: [{ ...summary, transactionCount: 2 }],
    monthlyIncome: 0,
    resetDay: 25,
    now: new Date(2026, 8, 28),
  });
  assert.equal(cycles[0].expense, 1_000);
  assert.equal(cycles[0].net, 6_000);
});

test('current-cycle trend responds to income and expense changes without counting transfers', () => {
  const inputs = {
    jars: [jar],
    jarRegistry: [jar],
    summaries: [summary],
    resetDay: 25,
    now: new Date(2026, 8, 28),
  };
  const before = buildAnalyticsCycles({
    ...inputs,
    transactions: [transaction('expense', 'expense', '2026-09-26', 600, 'Ăn uống')],
    monthlyIncome: 5_000,
  }).at(-1)!;
  const after = buildAnalyticsCycles({
    ...inputs,
    transactions: [
      transaction('expense', 'expense', '2026-09-26', 1_200, 'Ăn uống'),
      transaction('transfer', 'transfer', '2026-09-27', 3_000, 'Chuyển hũ'),
    ],
    monthlyIncome: 8_000,
  }).at(-1)!;

  assert.deepEqual([before.income, before.expense, before.net], [5_000, 600, 4_400]);
  assert.deepEqual([after.income, after.expense, after.net], [8_000, 1_200, 6_800]);
});
