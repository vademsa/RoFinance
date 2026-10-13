import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jar, Transaction } from '../types';
import { createMonthlyCycleSummary, getCarryoverTotal } from './monthlyCycle';
import { addHistoricalOpeningBalance, replayHistoricalBalances } from './historicalBalances';

const jar = (id = 'nec'): Jar => ({
  id, code: 'NEC', name: 'Thiết yếu', percentage: 50,
  bankName: 'Techcombank', bankCode: 'TCB', accountNumber: '123456789', accountName: 'OWNER',
  color: '#fff', description: '', targetBudget: 0, currentSpent: 0, cycleAllocation: 0,
  carryovers: [], transferredIn: [],
});
const expense = (id: string, date: string, amount: number): Transaction => ({
  id, date, amount, type: 'expense', jarId: 'nec', category: 'Ăn uống', description: id,
});

test('manual opening balance lets previous-cycle expenses change carryover without touching current allocation', () => {
  const current = { ...jar(), cycleAllocation: 500, targetBudget: 500 };
  const txs = [expense('old', '2026-09-07', 200), expense('new', '2026-09-26', 100)];
  const summaries = addHistoricalOpeningBalance([], txs, [current], '2026-09-07', 'nec', 1_000, 25,
    new Date(2026, 9, 5));
  const result = replayHistoricalBalances(summaries, txs, [current], 25,
    new Map([['2026-08-25', { jarIds: new Set(['nec']) }]]), new Date(2026, 9, 5));
  assert.equal(result.summaries[0].jarBreakdown?.[0].manualOpeningBalance, 1_000);
  assert.equal(result.summaries[0].jarBreakdown?.[0].remaining, 800);
  assert.equal(getCarryoverTotal(result.jars[0]), 800);
  assert.equal(result.jars[0].cycleAllocation, 500);
  assert.equal(result.jars[0].targetBudget, 1_300);
  assert.equal(result.jars[0].currentSpent, 100);
});

test('backdated change replays through two completed cycles but a later manual opening stops propagation', () => {
  const base = jar();
  const first = createMonthlyCycleSummary(new Date(2026, 6, 25), new Date(2026, 7, 25), [],
    [{ ...base, cycleAllocation: 1_000, targetBudget: 1_000 }], 1_000);
  const second = createMonthlyCycleSummary(new Date(2026, 7, 25), new Date(2026, 8, 25), [],
    [{ ...base, carryovers: first.jarBreakdown?.[0].closingCarryovers, targetBudget: 1_000 }], 0);
  const txs = [expense('late', '2026-08-01', 300)];
  const changed = new Map([['2026-07-25', {
    jarIds: new Set(['nec']), expenseByJarDelta: { nec: 300 }, transactionCountDelta: 1,
  }]]);
  const replayed = replayHistoricalBalances([first, second], txs, [base], 25, changed,
    new Date(2026, 8, 26));
  assert.equal(replayed.summaries[0].jarBreakdown?.[0].remaining, 700);
  assert.equal(replayed.summaries[1].jarBreakdown?.[0].openingCarryover, 700);
  assert.equal(getCarryoverTotal(replayed.jars[0]), 700);

  const anchoredSecond = addHistoricalOpeningBalance([first, second], txs, [base], '2026-09-01',
    'nec', 900, 25, new Date(2026, 8, 26));
  const stopped = replayHistoricalBalances(anchoredSecond, txs, [base], 25, changed,
    new Date(2026, 8, 26));
  assert.equal(stopped.summaries[1].jarBreakdown?.[0].manualOpeningBalance, 900);
  assert.equal(getCarryoverTotal(stopped.jars[0]), 0);
});

test('missing intermediate cycle blocks replay instead of inventing salary allocation', () => {
  const base = jar();
  const first = createMonthlyCycleSummary(new Date(2026, 6, 25), new Date(2026, 7, 25), [],
    [{ ...base, cycleAllocation: 1_000, targetBudget: 1_000 }], 1_000);
  assert.throws(() => replayHistoricalBalances([first], [], [base], 25,
    new Map([['2026-07-25', { jarIds: new Set(['nec']) }]]), new Date(2026, 9, 5)), /chưa có số dư/);
});

test('late expense keeps unitemized historical totals and adds only the new delta', () => {
  const base = jar();
  const prior = createMonthlyCycleSummary(new Date(2026, 7, 25), new Date(2026, 8, 25), [],
    [{ ...base, cycleAllocation: 1_000, targetBudget: 1_000 }], 1_000);
  const legacy = {
    ...prior, expense: 400, transactionCount: 4,
    spendingByJar: [{ jarId: 'nec', amount: 400 }],
    jarBreakdown: prior.jarBreakdown!.map((snapshot) => ({ ...snapshot, spent: 400, remaining: 600,
      closingCarryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 600 }] })),
  };
  const result = replayHistoricalBalances([legacy], [expense('late', '2026-09-07', 100)], [base], 25,
    new Map([['2026-08-25', { jarIds: new Set(['nec']), expenseByJarDelta: { nec: 100 },
      transactionCountDelta: 1 }]]), new Date(2026, 8, 26));
  assert.equal(result.summaries[0].expense, 500);
  assert.equal(result.summaries[0].transactionCount, 5);
  assert.equal(result.summaries[0].jarBreakdown?.[0].spent, 500);
  assert.equal(result.summaries[0].jarBreakdown?.[0].remaining, 500);
});

test('plan switch barrier rejects history replay without mutating current jars', () => {
  const oldJar = jar('old');
  const current = { ...jar('new'), transferredIn: [{ sourceCycleStart: '2026-08-25',
    sourceCycleEnd: '2026-09-24', sourceJarId: 'old', amount: 300 }], targetBudget: 300 };
  const prior = createMonthlyCycleSummary(new Date(2026, 7, 25), new Date(2026, 8, 25), [],
    [{ ...oldJar, cycleAllocation: 300, targetBudget: 300 }], 300);
  const before = JSON.stringify(current);
  assert.throws(() => replayHistoricalBalances([prior], [], [current], 25,
    new Map([['2026-08-25', { jarIds: new Set(['old']) }]]), new Date(2026, 8, 26)), /đối soát/);
  assert.equal(JSON.stringify(current), before);
});

test('mixed income and expense across two salary cycles keeps each cycle separate', () => {
  const base = jar();
  const first = createMonthlyCycleSummary(new Date(2026, 6, 25), new Date(2026, 7, 25), [],
    [{ ...base, cycleAllocation: 1_000, targetBudget: 1_000 }], 1_000);
  const second = createMonthlyCycleSummary(new Date(2026, 7, 25), new Date(2026, 8, 25), [],
    [{ ...base, carryovers: first.jarBreakdown?.[0].closingCarryovers, targetBudget: 1_000 }], 0);
  const transactions: Transaction[] = [
    expense('first-expense', '2026-08-01', 300),
    { id: 'first-income', date: '2026-08-02', amount: 200, type: 'income', jarId: 'nec',
      category: 'Lương', description: '', allocations: [{ jarId: 'nec', amount: 200 }] },
    expense('second-expense', '2026-09-01', 100),
    { id: 'second-income', date: '2026-09-02', amount: 400, type: 'income', jarId: 'nec',
      category: 'Lương', description: '', allocations: [{ jarId: 'nec', amount: 400 }] },
  ];
  const adjusted = [
    { ...first, income: first.income + 200, jarBreakdown: first.jarBreakdown!.map((snapshot) => ({
      ...snapshot, cycleAllocation: snapshot.cycleAllocation + 200,
    })) },
    { ...second, income: second.income + 400, jarBreakdown: second.jarBreakdown!.map((snapshot) => ({
      ...snapshot, cycleAllocation: snapshot.cycleAllocation + 400,
    })) },
  ];
  const changes = new Map([
    ['2026-07-25', { jarIds: new Set(['nec']), expenseByJarDelta: { nec: 300 }, transactionCountDelta: 2 }],
    ['2026-08-25', { jarIds: new Set(['nec']), expenseByJarDelta: { nec: 100 }, transactionCountDelta: 2 }],
  ]);
  const result = replayHistoricalBalances(adjusted, transactions, [base], 25, changes,
    new Date(2026, 8, 26));
  assert.equal(result.summaries[0].income, 1_200);
  assert.equal(result.summaries[0].expense, 300);
  assert.equal(result.summaries[0].jarBreakdown?.[0].remaining, 900);
  assert.equal(result.summaries[1].income, 400);
  assert.equal(result.summaries[1].expense, 100);
  assert.equal(result.summaries[1].jarBreakdown?.[0].openingCarryover, 900);
  assert.equal(result.summaries[1].jarBreakdown?.[0].remaining, 1_200);
  assert.equal(getCarryoverTotal(result.jars[0]), 1_200);
});
