import type { Transaction } from '../types';

export interface TransactionDateGroup {
  date: string;
  transactions: Transaction[];
  income: number;
  expense: number;
  transfer: number;
}

export function sortTransactionsByDate(transactions: Transaction[]) {
  return transactions
    .map((transaction, originalIndex) => ({ transaction, originalIndex }))
    .sort((left, right) =>
      right.transaction.date.localeCompare(left.transaction.date) ||
      right.transaction.id.localeCompare(left.transaction.id) ||
      left.originalIndex - right.originalIndex
    )
    .map(({ transaction }) => transaction);
}

export function groupTransactionsByDate(transactions: Transaction[]): TransactionDateGroup[] {
  const groups = new Map<string, TransactionDateGroup>();
  for (const transaction of sortTransactionsByDate(transactions)) {
    const date = transaction.date.slice(0, 10);
    const group = groups.get(date) || {
      date,
      transactions: [],
      income: 0,
      expense: 0,
      transfer: 0,
    };
    group.transactions.push(transaction);
    group[transaction.type] += transaction.amount;
    groups.set(date, group);
  }
  return [...groups.values()];
}
