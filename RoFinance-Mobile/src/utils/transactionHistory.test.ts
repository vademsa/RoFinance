import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from '../types';
import { groupTransactionsByDate, sortTransactionsByDate } from './transactionHistory';

const transaction = (id: string, date: string, amount = 100_000): Transaction => ({
  id,
  type: 'expense',
  amount,
  jarId: 'jar-nec',
  category: 'Ăn uống',
  date,
  description: id,
});

test('backdated transactions are sorted by transaction date instead of insertion order', () => {
  const recentlyAddedBackdate = transaction('tx-999', '2026-09-01');
  const olderCreatedCurrentDate = transaction('tx-100', '2026-09-07');
  assert.deepEqual(
    sortTransactionsByDate([recentlyAddedBackdate, olderCreatedCurrentDate]).map((item) => item.id),
    ['tx-100', 'tx-999'],
  );
});

test('transactions are grouped by day with daily totals', () => {
  const income: Transaction = { ...transaction('income', '2026-09-07', 500_000), type: 'income' };
  const groups = groupTransactionsByDate([
    transaction('expense-1', '2026-09-01', 30_000),
    transaction('expense-2', '2026-09-07', 50_000),
    income,
  ]);
  assert.deepEqual(groups.map((group) => group.date), ['2026-09-07', '2026-09-01']);
  assert.equal(groups[0].expense, 50_000);
  assert.equal(groups[0].income, 500_000);
  assert.equal(groups[0].transactions.length, 2);
});
