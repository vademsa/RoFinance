import type { Jar, JarCarryover, MonthlyCycleSummary, Transaction } from '../types';
import {
  getClosingCarryovers,
  getCycleTransactions,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  parseLocalDate,
  rebuildMonthlyCycleSummaries,
  toLocalDateKey,
} from './monthlyCycle';

export interface AnalyticsJarRow {
  jarId: string;
  code: string;
  name: string;
  color: string;
  budget: number | null;
  allocation: number | null;
  opening: number | null;
  spent: number;
  remaining: number | null;
  archived: boolean;
  closingCarryovers: JarCarryover[];
}

export interface AnalyticsCycle {
  id: string;
  start: string;
  end: string;
  isCurrent: boolean;
  income: number;
  expense: number;
  net: number;
  budget: number | null;
  allocation: number | null;
  opening: number | null;
  carryover: number | null;
  transactionCount: number;
  transactions: Transaction[];
  jars: AnalyticsJarRow[];
}

export interface CategoryTotal {
  name: string;
  amount: number;
  count: number;
}

const amount = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, value || 0) : 0;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function getCategoryTotals(transactions: Transaction[], type: 'income' | 'expense'): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  transactions.filter((transaction) => transaction.type === type).forEach((transaction) => {
    const value = amount(transaction.amount);
    if (!value) return;
    const name = transaction.category?.trim() || 'Chưa phân loại';
    const previous = totals.get(name);
    totals.set(name, {
      name,
      amount: (previous?.amount || 0) + value,
      count: (previous?.count || 0) + 1,
    });
  });
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'vi'));
}

export function buildAnalyticsCycles({
  jars,
  jarRegistry,
  transactions,
  summaries,
  monthlyIncome,
  resetDay,
  now = new Date(),
}: {
  jars: Jar[];
  jarRegistry: Jar[];
  transactions: Transaction[];
  summaries: MonthlyCycleSummary[];
  monthlyIncome: number;
  resetDay: number;
  now?: Date;
}): AnalyticsCycle[] {
  const currentStart = getFinancialCycleStart(now, resetDay);
  const currentEnd = getNextFinancialCycleStart(currentStart, resetDay);
  const currentStartKey = toLocalDateKey(currentStart);
  const currentEndInclusive = new Date(currentEnd);
  currentEndInclusive.setDate(currentEndInclusive.getDate() - 1);
  const currentTransactions = getCycleTransactions(transactions, currentStart, currentEnd);
  const currentSpending = new Map<string, number>();
  currentTransactions.filter((transaction) => transaction.type === 'expense').forEach((transaction) => {
    currentSpending.set(transaction.jarId, (currentSpending.get(transaction.jarId) || 0) + amount(transaction.amount));
  });
  const currentJars: AnalyticsJarRow[] = jars.map((jar) => {
    const spent = currentSpending.get(jar.id) || 0;
    const budget = amount(jar.targetBudget);
    const opening = sum((jar.carryovers || []).map((item) => amount(item.amount)))
      + sum((jar.transferredIn || []).map((item) => amount(item.amount)));
    return {
      jarId: jar.id,
      code: jar.code,
      name: jar.name,
      color: jar.color,
      budget,
      allocation: amount(jar.cycleAllocation ?? budget - opening),
      opening,
      spent,
      remaining: Math.max(0, budget - spent),
      archived: false,
      closingCarryovers: getClosingCarryovers(jar, currentStart, currentEnd, spent),
    };
  });
  const currentIncome = amount(monthlyIncome);
  const currentExpense = sum([...currentSpending.values()]);
  const current: AnalyticsCycle = {
    id: currentStartKey,
    start: currentStartKey,
    end: toLocalDateKey(currentEndInclusive),
    isCurrent: true,
    income: currentIncome,
    expense: currentExpense,
    net: currentIncome - currentExpense,
    budget: sum(currentJars.map((jar) => jar.budget || 0)),
    allocation: sum(currentJars.map((jar) => jar.allocation || 0)),
    opening: sum(currentJars.map((jar) => jar.opening || 0)),
    carryover: sum(currentJars.map((jar) => jar.remaining || 0)),
    transactionCount: currentTransactions.length,
    transactions: currentTransactions,
    jars: currentJars,
  };

  const registry = new Map(jarRegistry.map((jar) => [jar.id, jar]));
  const completed = summaries.flatMap((summary): AnalyticsCycle[] => {
    const start = parseLocalDate(summary.cycleStart);
    const endInclusive = parseLocalDate(summary.cycleEnd);
    if (!start || !endInclusive || summary.cycleStart === currentStartKey) return [];
    const endExclusive = new Date(endInclusive);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const cycleTransactions = getCycleTransactions(transactions, start, endExclusive);
    const recordedExpenses = cycleTransactions.filter((transaction) => transaction.type === 'expense');
    const recordedExpense = sum(recordedExpenses.map((transaction) => amount(transaction.amount)));
    // Older imports can have only a saved summary. Recalculate only when its
    // detailed transactions are present; otherwise keep the historical total.
    const hasCompleteExpenseDetails = (summary.transactionCount > 0
      ? cycleTransactions.length >= summary.transactionCount
      : amount(summary.expense) === 0)
      && (recordedExpenses.length > 0 || amount(summary.expense) === 0);
    const calculatedSummary = hasCompleteExpenseDetails && summary.jarBreakdown?.length
      ? rebuildMonthlyCycleSummaries([summary], cycleTransactions, jarRegistry, summary.income)[0]
      : summary;
    const expenseByJar = new Map<string, number>();
    if (hasCompleteExpenseDetails) {
      recordedExpenses.forEach((transaction) => {
        expenseByJar.set(transaction.jarId, (expenseByJar.get(transaction.jarId) || 0) + amount(transaction.amount));
      });
    }
    const jarRows: AnalyticsJarRow[] = calculatedSummary.jarBreakdown?.length
      ? calculatedSummary.jarBreakdown.map((snapshot) => ({
          jarId: snapshot.jarId,
          code: snapshot.jarCode,
          name: snapshot.jarName,
          color: registry.get(snapshot.jarId)?.color || '#6366f1',
          budget: amount(snapshot.availableBudget),
          allocation: amount(snapshot.cycleAllocation),
          opening: amount(snapshot.openingCarryover) + amount(snapshot.transferredInAmount),
          spent: amount(snapshot.spent),
          remaining: amount(snapshot.remaining),
          archived: Boolean(snapshot.isArchived),
          closingCarryovers: snapshot.closingCarryovers || [],
        }))
      : (hasCompleteExpenseDetails
        ? [...expenseByJar].map(([jarId, spent]) => ({ jarId, amount: spent }))
        : summary.spendingByJar).map((entry) => {
          const savedJar = registry.get(entry.jarId);
          return {
            jarId: entry.jarId,
            code: savedJar?.code || '—',
            name: savedJar?.name || entry.jarId,
            color: savedJar?.color || '#6366f1',
            budget: null,
            allocation: null,
            opening: null,
            spent: amount(entry.amount),
            remaining: null,
            archived: !jars.some((jar) => jar.id === entry.jarId),
            closingCarryovers: [],
          };
        });
    const income = amount(summary.income);
    const expense = hasCompleteExpenseDetails ? recordedExpense : amount(summary.expense);
    return [{
      id: summary.id,
      start: summary.cycleStart,
      end: summary.cycleEnd,
      isCurrent: false,
      income,
      expense,
      net: income - expense,
      budget: summary.jarBreakdown?.length ? sum(jarRows.map((jar) => jar.budget || 0)) : null,
      allocation: summary.jarBreakdown?.length ? sum(jarRows.map((jar) => jar.allocation || 0)) : null,
      opening: summary.jarBreakdown?.length ? sum(jarRows.map((jar) => jar.opening || 0)) : null,
      carryover: Number.isFinite(calculatedSummary.carriedForward)
        ? amount(calculatedSummary.carriedForward)
        : calculatedSummary.jarBreakdown?.length
          ? sum(jarRows.filter((jar) => !jar.archived).map((jar) => jar.remaining || 0))
          : null,
      transactionCount: hasCompleteExpenseDetails
        ? cycleTransactions.length
        : Math.max(0, summary.transactionCount || cycleTransactions.length),
      transactions: cycleTransactions,
      jars: jarRows,
    }];
  });

  return [...completed, current].sort((a, b) => a.start.localeCompare(b.start));
}

export function getRecentCycleTotals(cycles: AnalyticsCycle[], limit = 12) {
  const recent = cycles.slice(-limit);
  const income = sum(recent.map((cycle) => cycle.income));
  const expense = sum(recent.map((cycle) => cycle.expense));
  return {
    cycles: recent,
    income,
    expense,
    net: income - expense,
    averageExpense: recent.length ? expense / recent.length : 0,
    retentionRate: income > 0 ? (income - expense) / income : null,
  };
}
