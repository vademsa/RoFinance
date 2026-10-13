import type { Jar, JarCarryover, MonthlyCycleSummary, Transaction } from '../types';
import {
  applyCurrentCycleSpending,
  createMonthlyCycleSummary,
  getClosingCarryovers,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  normalizeJarBudgetState,
  parseLocalDate,
  toLocalDateKey,
} from './monthlyCycle';

type Snapshot = NonNullable<MonthlyCycleSummary['jarBreakdown']>[number];
export type HistoricalCycleChange = {
  jarIds: Set<string>;
  expenseByJarDelta?: Record<string, number>;
  transactionCountDelta?: number;
};
const total = (lots: JarCarryover[]) => lots.reduce((sum, lot) => sum + lot.amount, 0);
const money = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000_000;

function openingLots(summary: MonthlyCycleSummary, amount: number): JarCarryover[] {
  return amount ? [{ sourceCycleStart: summary.cycleStart, sourceCycleEnd: summary.cycleStart, amount }] : [];
}

function recalculateSnapshot(
  summary: MonthlyCycleSummary,
  snapshot: Snapshot,
  opening: JarCarryover[],
  spent: number,
): Snapshot {
  const start = parseLocalDate(summary.cycleStart)!;
  const end = parseLocalDate(summary.cycleEnd)!;
  end.setDate(end.getDate() + 1);
  const jar = normalizeJarBudgetState({
    id: snapshot.jarId, code: snapshot.jarCode, name: snapshot.jarName,
    percentage: 0, bankName: '', bankCode: '', accountNumber: '', accountName: '',
    color: '#6366f1', description: '', targetBudget: 0, currentSpent: spent,
    carryovers: opening, transferredIn: snapshot.transferredIn || [],
    cycleAllocation: snapshot.cycleAllocation,
  });
  const closingCarryovers = getClosingCarryovers(jar, start, end, spent);
  return {
    ...snapshot,
    openingCarryover: total(opening),
    openingCarryovers: opening,
    transferredInAmount: total(snapshot.transferredIn || []),
    availableBudget: jar.targetBudget,
    spent,
    remaining: total(closingCarryovers),
    closingCarryovers,
  };
}

export function getHistoricalSummaryForDate(
  summaries: MonthlyCycleSummary[], date: string, resetDay: number,
) {
  const parsed = parseLocalDate(date);
  if (!parsed || toLocalDateKey(parsed) !== date) return undefined;
  const key = toLocalDateKey(getFinancialCycleStart(parsed, resetDay));
  return summaries.find((summary) => summary.cycleStart === key);
}

export function addHistoricalOpeningBalance(
  summaries: MonthlyCycleSummary[],
  transactions: Transaction[],
  jars: Jar[],
  date: string,
  jarId: string,
  amount: number,
  resetDay: number,
  now = new Date(),
) {
  const parsed = parseLocalDate(date);
  const jar = jars.find((item) => item.id === jarId);
  if (!parsed || toLocalDateKey(parsed) !== date || !jar || !money(amount)) {
    throw new Error('Ngày, hũ hoặc số dư đầu chu kỳ không hợp lệ.');
  }
  const cycleStart = getFinancialCycleStart(parsed, resetDay);
  if (cycleStart >= getFinancialCycleStart(now, resetDay)) {
    throw new Error('Chỉ dùng chức năng này cho chu kỳ đã kết thúc.');
  }
  const key = toLocalDateKey(cycleStart);
  const existing = summaries.find((summary) => summary.cycleStart === key);
  if (existing?.jarBreakdown?.some((item) => item.jarId === jarId && item.isArchived)) {
    throw new Error('Không thể chỉnh số dư của hũ đã lưu trữ trong chu kỳ này.');
  }
  const nextStart = getNextFinancialCycleStart(cycleStart, resetDay);
  const allocatedIncome = transactions
    .filter((item) => item.type === 'income' && item.date >= key && item.date < toLocalDateKey(nextStart))
    .flatMap((item) => item.allocations || [])
    .filter((allocation) => allocation.jarId === jarId)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
  const seed: Jar = {
    ...jar, currentSpent: 0, targetBudget: amount + allocatedIncome, cycleAllocation: allocatedIncome,
    carryovers: amount ? [{ sourceCycleStart: key, sourceCycleEnd: key, amount }] : [],
    transferredIn: [],
  };
  const generated = createMonthlyCycleSummary(cycleStart, nextStart, transactions, [seed],
    transactions.filter((item) => item.type === 'income' && item.date >= key && item.date < toLocalDateKey(nextStart))
      .reduce((sum, item) => sum + item.amount, 0));
  const base = existing || generated;
  const existingSnapshot = base.jarBreakdown?.find((item) => item.jarId === jarId);
  const snapshot = {
    ...(existingSnapshot || generated.jarBreakdown![0]),
    manualOpeningBalance: amount,
  };
  const nextSummary: MonthlyCycleSummary = {
    ...base,
    jarBreakdown: [...(base.jarBreakdown || []).filter((item) => item.jarId !== jarId), snapshot],
  };
  return [...summaries.filter((summary) => summary.cycleStart !== key), nextSummary]
    .sort((left, right) => left.cycleStart.localeCompare(right.cycleStart));
}

export function replayHistoricalBalances(
  summaries: MonthlyCycleSummary[],
  transactions: Transaction[],
  currentJars: Jar[],
  resetDay: number,
  changesByCycle: Map<string, HistoricalCycleChange>,
  now = new Date(),
) {
  const currentStart = getFinancialCycleStart(now, resetDay);
  const currentKey = toLocalDateKey(currentStart);
  const firstKey = [...changesByCycle.keys()].sort()[0];
  if (!firstKey || firstKey >= currentKey) {
    return { summaries, jars: applyCurrentCycleSpending(currentJars, transactions, resetDay, now) };
  }
  const byCycle = new Map(summaries.map((summary) => [summary.cycleStart, summary]));
  const active = new Set<string>();
  let previousClosing = new Map<string, JarCarryover[]>();
  let previousKey = '';
  for (let key = firstKey; key < currentKey;) {
    const summary = byCycle.get(key);
    if (!summary?.jarBreakdown?.length) {
      const futureAnchor = [...byCycle.values()]
        .filter((item) => item.cycleStart > key && item.cycleStart < currentKey)
        .sort((left, right) => left.cycleStart.localeCompare(right.cycleStart))
        .find((item) => [...active].every((id) => item.jarBreakdown?.some((snapshot) =>
          snapshot.jarId === id && snapshot.manualOpeningBalance !== undefined)));
      const laterChanges = [...changesByCycle.keys()].some((cycleKey) => cycleKey > key);
      if (active.size > 0 && futureAnchor && !laterChanges) {
        active.clear();
        break;
      }
      throw new Error(`Chu kỳ ${key} chưa có số dư hũ đầu kỳ. Hãy đối soát chu kỳ này trước.`);
    }
    const cycleDate = parseLocalDate(key)!;
    const nextKey = toLocalDateKey(getNextFinancialCycleStart(cycleDate, resetDay));
    const change = changesByCycle.get(key);
    const directlyChanged = change?.jarIds || new Set<string>();
    for (const id of directlyChanged) active.add(id);
    const snapshotIds = new Set(summary.jarBreakdown.map((item) => item.jarId));
    for (const id of active) {
      if (!snapshotIds.has(id)) {
        throw new Error(`Hũ liên quan không có dữ liệu trong chu kỳ ${key}; cần đối soát sau khi đổi kiểu hũ.`);
      }
    }
    for (const snapshot of summary.jarBreakdown) {
      if (snapshot.transferredIn?.some((lot) => lot.sourceJarId && active.has(lot.sourceJarId) && lot.sourceJarId !== snapshot.jarId)) {
        throw new Error(`Chu kỳ ${key} có chuyển tiền khi đổi kiểu hũ; cần đối soát số dư sau lần chuyển này.`);
      }
    }
    const nextBreakdown = summary.jarBreakdown.map((snapshot) => {
      if (!active.has(snapshot.jarId)) return snapshot;
      if (snapshot.isArchived) throw new Error('Không thể tính lại hũ đã lưu trữ tự động.');
      if (previousKey && snapshot.manualOpeningBalance !== undefined && !directlyChanged.has(snapshot.jarId)) {
        active.delete(snapshot.jarId);
        return snapshot;
      }
      const opening = snapshot.manualOpeningBalance !== undefined
        ? openingLots(summary, snapshot.manualOpeningBalance)
        : previousKey
          ? previousClosing.get(snapshot.jarId)
          : snapshot.openingCarryovers?.length
            ? snapshot.openingCarryovers
            : openingLots(summary, snapshot.openingCarryover);
      if (!opening) throw new Error(`Hũ ${snapshot.jarName} thiếu số dư chuyển tiếp tại chu kỳ ${key}.`);
      const spent = snapshot.spent + (change?.expenseByJarDelta?.[snapshot.jarId] || 0);
      if (!money(spent)) throw new Error(`Số chi của hũ ${snapshot.jarName} trong chu kỳ ${key} không hợp lệ.`);
      return recalculateSnapshot(summary, snapshot, opening, spent);
    });
    const expenseDelta = Object.values(change?.expenseByJarDelta || {}).reduce((sum, value) => sum + value, 0);
    if (!money(summary.expense + expenseDelta) ||
      !Number.isSafeInteger(summary.transactionCount + (change?.transactionCountDelta || 0)) ||
      summary.transactionCount + (change?.transactionCountDelta || 0) < 0) {
      throw new Error(`Tổng giao dịch của chu kỳ ${key} không hợp lệ.`);
    }
    const spendingByJar = new Map(summary.spendingByJar.map((item) => [item.jarId, item.amount]));
    for (const [jarId, delta] of Object.entries(change?.expenseByJarDelta || {})) {
      const nextAmount = (spendingByJar.get(jarId) || 0) + delta;
      if (!money(nextAmount)) throw new Error(`Chi tiêu của hũ trong chu kỳ ${key} không hợp lệ.`);
      spendingByJar.set(jarId, nextAmount);
    }
    byCycle.set(key, {
      ...summary,
      jarBreakdown: nextBreakdown,
      expense: summary.expense + expenseDelta,
      transactionCount: summary.transactionCount + (change?.transactionCountDelta || 0),
      spendingByJar: Array.from(spendingByJar, ([jarId, amount]) => ({ jarId, amount })),
      carriedForward: nextBreakdown.reduce((sum, item) => sum + (item.isArchived ? 0 : item.remaining), 0),
    });
    previousClosing = new Map(nextBreakdown.filter((item) => !item.isArchived)
      .map((item) => [item.jarId, item.closingCarryovers]));
    previousKey = key;
    key = nextKey;
  }
  for (const id of active) {
    if (!currentJars.some((jar) => jar.id === id) || currentJars.some((jar) =>
      jar.transferredIn?.some((lot) => lot.sourceJarId === id && lot.sourceJarId !== jar.id))) {
      throw new Error('Hũ đã đổi kiểu hoặc chuyển tiền trước chu kỳ hiện tại; cần đối soát số dư sau lần chuyển.');
    }
  }
  const nextJars = currentJars.map((rawJar) => {
    if (!active.has(rawJar.id)) return rawJar;
    const closing = previousClosing.get(rawJar.id);
    if (!closing) throw new Error(`Hũ ${rawJar.name} không tồn tại ở chu kỳ trước; cần đối soát số dư hiện tại.`);
    return normalizeJarBudgetState({ ...rawJar, carryovers: closing.map((lot) => ({ ...lot })) });
  });
  return {
    summaries: summaries.map((summary) => byCycle.get(summary.cycleStart) || summary),
    jars: applyCurrentCycleSpending(nextJars, transactions, resetDay, now),
  };
}
