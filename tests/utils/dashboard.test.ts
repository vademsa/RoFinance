import assert from 'node:assert/strict';
import test from 'node:test';
import type { MonthlyCycleSummary, Transaction } from '../../src/types';
import { dashboardDate, getDashboardCalendar, getDashboardDays, getDashboardPeriods, getDashboardTransactions } from '../../src/utils/dashboard';

const tx = (id: string, type: Transaction['type'], amount: number, date: string, jarId = 'jar-a', bankAccountId?: string): Transaction =>
  ({ id, type, amount, date, jarId, bankAccountId, category: 'Synthetic custom', description: 'Synthetic' });
const period = { id: '2026-09-25', start: '2026-09-25', end: '2026-10-24', isCurrent: true };

test('dashboard records actual cash flow once; transfers, configured income and invalid amounts do not create income', () => {
  const rows = [tx('one', 'income', 1000, '2026-10-01'), tx('two', 'expense', 200, '2026-10-01'), tx('bank', 'income', 300, '2026-10-02', '', 'bank'),
    tx('transfer', 'transfer', 9999, '2026-10-01'), tx('negative', 'expense', -1, '2026-10-01'), tx('nan', 'expense', NaN, '2026-10-01')];
  rows[0].allocations = [{ jarId: 'jar-a', amount: 600 }, { jarId: 'jar-b', amount: 400 }];
  const before = structuredClone(rows);
  const filtered = getDashboardTransactions(rows, period);
  const days = getDashboardDays(filtered, period);
  assert.equal(days.reduce((sum, day) => sum + day.income, 0), 1300);
  assert.equal(days.reduce((sum, day) => sum + day.expense, 0), 200);
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 3);
  assert.equal(days.length, 30); assert.deepEqual(rows, before);
  assert.equal(getDashboardDays([], period).reduce((sum, day) => sum + day.income, 0), 0);
});

test('scope and actual account filters do not infer account ownership from jar configuration', () => {
  const rows = [tx('personal-bank', 'expense', 10, '2026-10-01', 'jar-a', 'bank'), tx('business', 'expense', 20, '2026-10-01', '', 'bank'),
    tx('cash', 'expense', 30, '2026-10-01'), tx('allocated', 'income', 40, '2026-10-01', '')];
  rows[3].allocations = [{ jarId: 'jar-a', amount: 40 }];
  assert.deepEqual(getDashboardTransactions(rows, period, 'outside').map(row => row.id), ['business']);
  assert.deepEqual(getDashboardTransactions(rows, period, 'jars', 'bank').map(row => row.id), ['personal-bank']);
  assert.deepEqual(getDashboardTransactions(rows, period, 'jars', '').map(row => row.id), ['allocated', 'cash']);
  assert.deepEqual(getDashboardTransactions(rows, period, 'all', 'another-bank'), []);
});

test('date boundaries and calendar use local saved days without rolling invalid dates into a different month', () => {
  const rows = [tx('before', 'expense', 1, '2026-09-24'), tx('start', 'expense', 2, '2026-09-25'),
    tx('end', 'income', 3, '2026-10-24T23:59:00+07:00'), tx('next', 'expense', 4, '2026-10-25'), tx('invalid', 'expense', 5, '2026-09-31')];
  assert.deepEqual(getDashboardTransactions(rows, period).map(row => row.id), ['end', 'start']);
  assert.equal(dashboardDate('2026-02-30'), null);
  assert.equal(dashboardDate('2026-10-24T23:59:00+07:00'), '2026-10-24');
  const calendar = getDashboardCalendar('2026-10');
  assert.equal(calendar[0], '2026-09-28'); assert.equal(calendar[3], '2026-10-01');
  assert.equal(calendar.indexOf('2026-10-24') % 7, 5); assert.equal(calendar.length, 35);
  assert.deepEqual(getDashboardCalendar('invalid'), []);
  assert.ok(getDashboardCalendar('2028-02').includes('2028-02-29'));
});

test('old bank-only transactions are reviewable without snapshots; existing historical boundaries are retained', () => {
  const summaries: MonthlyCycleSummary[] = [{ id: 'old-snapshot', cycleStart: '2026-08-25', cycleEnd: '2026-09-24', income: 9000,
    expense: 0, transactionCount: 0, spendingByJar: [], createdAt: '2026-09-25' }];
  const rows = [tx('old-bank', 'income', 100, '2026-07-15', '', 'bank'), tx('stored-cycle', 'expense', 200, '2026-09-10')];
  const result = getDashboardPeriods(rows, summaries, 25, new Date(2026, 9, 24));
  assert.deepEqual(result.map(row => row.start), ['2026-09-25', '2026-08-25', '2026-06-25']);
  assert.equal(result[1].id, 'old-snapshot'); assert.equal(result[0].isCurrent, true);
  const changedReset = getDashboardPeriods(rows, summaries, 20, new Date(2026, 9, 24));
  assert.ok(changedReset.some(row => row.id === 'old-snapshot' && row.end === '2026-09-24'));
  assert.deepEqual(summaries[0].income, 9000);
});

test('reset 31 clamps short months and empty days are zero records, not fabricated transactions', () => {
  const [short] = getDashboardPeriods([], [], 31, new Date(2026, 2, 1));
  assert.equal(short.start, '2026-02-28'); assert.equal(short.end, '2026-03-30');
  const days = getDashboardDays([], short);
  assert.equal(days.length, 31); assert.ok(days.every(day => day.count === 0 && day.transactions.length === 0));
});

test('reset-day changes cannot put the same transaction in a saved cycle and an inferred cycle', () => {
  const summary: MonthlyCycleSummary = { id: 'old-reset-25', cycleStart: '2026-08-25', cycleEnd: '2026-09-24', income: 0,
    expense: 100, transactionCount: 1, spendingByJar: [], createdAt: '2026-09-25' };
  const rows = [tx('before-change', 'expense', 100, '2026-09-23'), tx('after-change', 'income', 200, '2026-09-25', '', 'bank'),
    tx('earlier-gap', 'expense', 50, '2026-08-22')];
  const periods = getDashboardPeriods(rows, [summary], 20, new Date(2026, 9, 24));
  assert.deepEqual(periods.find(row => row.start === '2026-09-25'), { id: '2026-09-25', start: '2026-09-25', end: '2026-10-19', isCurrent: false });
  assert.equal(periods.find(row => row.start === '2026-08-20')?.end, '2026-08-24');
  const ids = periods.flatMap(period => getDashboardTransactions(rows, period).map(row => row.id));
  assert.equal(ids.length, rows.length); assert.equal(new Set(ids).size, rows.length);
});
