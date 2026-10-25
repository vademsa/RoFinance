import { isBankOnlyIncome, isBankOnlyTransaction } from '../../shared/transactions';
import type { MonthlyCycleSummary, Transaction } from '../types';
import { createMonthlyCycleSummary, getFinancialCycleStart, getNextFinancialCycleStart, parseLocalDate, toLocalDateKey } from './monthlyCycle';

/** Refresh direct account cash flow without replaying or changing historical jars. */
export function syncBankTransactionSummaries(summaries: MonthlyCycleSummary[], previous: Transaction[], next: Transaction[], resetDay: number, now = new Date()) {
  const currentKey = toLocalDateKey(getFinancialCycleStart(now, resetDay));
  const grouped = (items: Transaction[]) => {
    const cycles = new Map<string, { income: number; expense: number; count: number }>();
    for (const item of items.filter(isBankOnlyTransaction)) {
      const date = parseLocalDate(item.date);
      if (!date) continue;
      const key = toLocalDateKey(getFinancialCycleStart(date, resetDay));
      if (key >= currentKey) continue;
      const existing = cycles.get(key) || { income: 0, expense: 0, count: 0 };
      cycles.set(key, { income: existing.income + (isBankOnlyIncome(item) ? item.amount : 0), expense: existing.expense + (isBankOnlyIncome(item) ? 0 : item.amount), count: existing.count + 1 });
    }
    return cycles;
  };
  const before = grouped(previous), after = grouped(next);
  const result = new Map(summaries.map((summary) => [summary.cycleStart, summary]));
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const summary = result.get(key);
    const receipt = after.get(key) || { income: 0, expense: 0, count: 0 };
    if (summary) result.set(key, { ...summary,
      income: Math.max(0, summary.income - (summary.unallocatedIncome || 0) + receipt.income),
      unallocatedIncome: receipt.income,
      expense: Math.max(0, summary.expense - (summary.unallocatedExpense || 0) + receipt.expense),
      unallocatedExpense: receipt.expense,
      transactionCount: summary.transactionCount + receipt.count - (before.get(key)?.count || 0),
    });
    else if (receipt.count) {
      const start = parseLocalDate(key)!;
      result.set(key, createMonthlyCycleSummary(start, getNextFinancialCycleStart(start, resetDay), next, [], 0));
    }
  }
  return [...result.values()].sort((a, b) => a.cycleStart.localeCompare(b.cycleStart));
}

// Compatibility for callers of the original receipt-only helper.
export const syncBankIncomeSummaries = syncBankTransactionSummaries;
