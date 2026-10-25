import type { MonthlyCycleSummary, Transaction } from '../types';
import { getFinancialCycleStart, getNextFinancialCycleStart, parseLocalDate, toLocalDateKey } from './monthlyCycle';

export interface DashboardPeriod { id: string; start: string; end: string; isCurrent: boolean }
export type DashboardScope = 'all' | 'jars' | 'outside';
export interface DashboardDay { date: string; income: number; expense: number; count: number; transactions: Transaction[] }

/** Saved date prefix, interpreted locally, never converted through UTC. */
export function dashboardDate(value: string): string | null {
  const key = String(value || '').slice(0, 10);
  const parsed = parseLocalDate(key);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && parsed && toLocalDateKey(parsed) === key ? key : null;
}

function periodForDate(date: Date, resetDay: number): DashboardPeriod {
  const start = getFinancialCycleStart(date, resetDay);
  const end = getNextFinancialCycleStart(start, resetDay);
  end.setDate(end.getDate() - 1);
  return { id: toLocalDateKey(start), start: toLocalDateKey(start), end: toLocalDateKey(end), isCurrent: false };
}

export function getDashboardPeriods(transactions: Transaction[], summaries: MonthlyCycleSummary[], resetDay: number, now = new Date()): DashboardPeriod[] {
  const today = toLocalDateKey(now);
  const current = { ...periodForDate(now, resetDay), isCurrent: true };
  const periods: DashboardPeriod[] = [current];
  // Preserve stored historical boundaries if the reset day has since changed.
  for (const summary of [...summaries].sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))) {
    const start = dashboardDate(summary.cycleStart), end = dashboardDate(summary.cycleEnd);
    if (!start || !end || start > end || end >= current.start || periods.some(row => row.start === start)) continue;
    periods.push({ id: summary.id, start, end, isCurrent: false });
  }
  // Bank-only backdates may have no jar snapshot. They must still be reviewable.
  for (const tx of transactions) {
    const date = dashboardDate(tx.date);
    if (!date || date > today || periods.some(row => date >= row.start && date <= row.end)) continue;
    const period = periodForDate(parseLocalDate(date)!, resetDay);
    // A later reset-day change may make an inferred range overlap an older
    // saved boundary. Fill only the uncovered gap, never count a date twice.
    for (const known of periods) {
      if (known.end < date && known.end >= period.start) {
        const next = parseLocalDate(known.end)!; next.setDate(next.getDate() + 1); period.start = toLocalDateKey(next);
      }
      if (known.start > date && known.start <= period.end) {
        const previous = parseLocalDate(known.start)!; previous.setDate(previous.getDate() - 1); period.end = toLocalDateKey(previous);
      }
    }
    period.id = period.start;
    if (!periods.some(row => row.start === period.start)) periods.push(period);
  }
  return periods.sort((a, b) => b.start.localeCompare(a.start));
}

export function isDashboardJarTransaction(tx: Transaction) {
  return Boolean(tx.jarId?.trim() || tx.allocations?.some(allocation => allocation.jarId?.trim()));
}

export function getDashboardTransactions(transactions: Transaction[], period: DashboardPeriod, scope: DashboardScope = 'all', accountId?: string): Transaction[] {
  return transactions.filter(tx => {
    const date = dashboardDate(tx.date);
    if (!date || date < period.start || date > period.end || !Number.isFinite(tx.amount) || tx.amount <= 0
      || (tx.type !== 'income' && tx.type !== 'expense')) return false;
    const inJar = isDashboardJarTransaction(tx);
    if ((scope === 'jars' && !inJar) || (scope === 'outside' && inJar)) return false;
    // undefined = all, '' = cash / account not recorded. Never guess an account
    // from a jar's configured bank details (those are only allocation metadata).
    return accountId === undefined || (tx.bankAccountId || '') === accountId;
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function getDashboardDays(transactions: Transaction[], period: DashboardPeriod): DashboardDay[] {
  const byDate = new Map<string, DashboardDay>();
  for (const tx of transactions) {
    const date = dashboardDate(tx.date);
    if (!date || date < period.start || date > period.end || !Number.isFinite(tx.amount) || tx.amount <= 0
      || (tx.type !== 'income' && tx.type !== 'expense')) continue;
    const day = byDate.get(date) || { date, income: 0, expense: 0, count: 0, transactions: [] };
    day[tx.type] += tx.amount; day.count++; day.transactions.push(tx); byDate.set(date, day);
  }
  const start = parseLocalDate(period.start), end = parseLocalDate(period.end);
  if (!start || !end || start > end) return [];
  const days: DashboardDay[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = toLocalDateKey(cursor);
    days.push(byDate.get(date) || { date, income: 0, expense: 0, count: 0, transactions: [] });
  }
  return days;
}

/** Monday-first, real neighboring dates; no hard-coded month alignment. */
export function getDashboardCalendar(month: string): string[] {
  const first = parseLocalDate(`${month}-01`);
  if (!first || toLocalDateKey(first).slice(0, 7) !== month) return [];
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) =>
    toLocalDateKey(new Date(first.getFullYear(), first.getMonth(), index - offset + 1)));
}
