import type { Jar, JarCarryover, MonthlyCycleSummary, Transaction } from '../types';

export function normalizeResetDay(day: number) {
  return Math.min(31, Math.max(1, Math.round(Number(day) || 1)));
}

function resetDate(year: number, monthIndex: number, resetDay: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(normalizeResetDay(resetDay), lastDay));
}

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getFinancialCycleStart(date: Date, resetDay: number) {
  const candidate = resetDate(date.getFullYear(), date.getMonth(), resetDay);
  return date >= candidate
    ? candidate
    : resetDate(date.getFullYear(), date.getMonth() - 1, resetDay);
}

export function getNextFinancialCycleStart(cycleStart: Date, resetDay: number) {
  return resetDate(cycleStart.getFullYear(), cycleStart.getMonth() + 1, resetDay);
}

export function getPreviousFinancialCycleStart(date: Date, resetDay: number) {
  const currentCycleStart = getFinancialCycleStart(date, resetDay);
  const previousCycleDay = new Date(currentCycleStart);
  previousCycleDay.setDate(previousCycleDay.getDate() - 1);
  return getFinancialCycleStart(previousCycleDay, resetDay);
}

export function getBackdatableJarIds(summary?: MonthlyCycleSummary) {
  return new Set(
    (summary?.jarBreakdown || [])
      .filter((item) => !item.isArchived)
      .map((item) => item.jarId),
  );
}

export function isDateInCycle(value: string, cycleStart: Date, cycleEnd: Date) {
  const date = parseLocalDate(value);
  return Boolean(date && date >= cycleStart && date < cycleEnd);
}

export function getCycleTransactions(
  transactions: Transaction[],
  cycleStart: Date,
  cycleEnd: Date,
) {
  return transactions.filter((transaction) =>
    isDateInCycle(transaction.date, cycleStart, cycleEnd)
  );
}

export function getExpenseByJar(transactions: Transaction[]) {
  return transactions.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.type === 'expense') {
      totals[transaction.jarId] = (totals[transaction.jarId] || 0) + transaction.amount;
    }
    return totals;
  }, {});
}

export function getCarryoverTotal(jar: Pick<Jar, 'carryovers'>) {
  return (jar.carryovers || []).reduce((total, item) =>
    total + (Number.isFinite(item.amount) ? Math.max(0, item.amount) : 0), 0);
}

export function getTransferredInTotal(jar: Pick<Jar, 'transferredIn'>) {
  return (jar.transferredIn || []).reduce((total, item) =>
    total + (Number.isFinite(item.amount) ? Math.max(0, item.amount) : 0), 0);
}

export function normalizeJarBudgetState(jar: Jar): Jar {
  const carryovers = (jar.carryovers || [])
    .filter((item) => item && Number.isFinite(item.amount) && item.amount > 0)
    .map((item) => ({ ...item, amount: Math.round(item.amount) }));
  const carryoverTotal = carryovers.reduce((total, item) => total + item.amount, 0);
  const transferredIn = (jar.transferredIn || [])
    .filter((item) => item && Number.isFinite(item.amount) && item.amount > 0)
    .map((item) => ({ ...item, amount: Math.round(item.amount) }));
  const transferredInTotal = transferredIn.reduce((total, item) => total + item.amount, 0);
  const cycleAllocation = Number.isFinite(jar.cycleAllocation)
    ? Math.max(0, Math.round(jar.cycleAllocation || 0))
    : Math.max(0, Math.round((jar.targetBudget || 0) - carryoverTotal - transferredInTotal));
  return {
    ...jar,
    carryovers,
    transferredIn,
    cycleAllocation,
    targetBudget: carryoverTotal + cycleAllocation + transferredInTotal,
  };
}

export function setJarCycleAllocation(jar: Jar, allocation: number): Jar {
  const normalized = normalizeJarBudgetState(jar);
  const cycleAllocation = Math.max(0, Math.round(allocation || 0));
  return {
    ...normalized,
    cycleAllocation,
    targetBudget: getCarryoverTotal(normalized) + getTransferredInTotal(normalized) + cycleAllocation,
  };
}

function consumeBudgetSources(sources: JarCarryover[], expense: number) {
  let remainingExpense = Math.max(0, expense);
  return sources.flatMap((source) => {
    const consumed = Math.min(source.amount, remainingExpense);
    remainingExpense -= consumed;
    const amount = source.amount - consumed;
    return amount > 0 ? [{ ...source, amount }] : [];
  });
}

export function getClosingCarryovers(
  jar: Jar,
  cycleStart: Date,
  cycleEnd: Date,
  expense: number,
) {
  const normalized = normalizeJarBudgetState(jar);
  const cycleEndInclusive = new Date(cycleEnd);
  cycleEndInclusive.setDate(cycleEndInclusive.getDate() - 1);
  const sources: JarCarryover[] = [
    ...(normalized.carryovers || []),
    ...(normalized.cycleAllocation
      ? [{
          sourceCycleStart: toLocalDateKey(cycleStart),
          sourceCycleEnd: toLocalDateKey(cycleEndInclusive),
          amount: normalized.cycleAllocation,
        }]
      : []),
    ...(normalized.transferredIn || []),
  ];
  return consumeBudgetSources(sources, expense);
}

export function rolloverJarBalances(
  jars: Jar[],
  transactions: Transaction[],
  cycleStart: Date,
  cycleEnd: Date,
) {
  const expenseByJar = getExpenseByJar(getCycleTransactions(transactions, cycleStart, cycleEnd));
  return jars.map((jar) => {
    const cycleKey = toLocalDateKey(cycleStart);
    if (jar.lastRolloverCycleStart === cycleKey) {
      return { ...normalizeJarBudgetState(jar), currentSpent: 0 };
    }
    const closingCarryovers = getClosingCarryovers(
      jar,
      cycleStart,
      cycleEnd,
      expenseByJar[jar.id] || 0,
    );
    const targetBudget = closingCarryovers.reduce((total, item) => total + item.amount, 0);
    return {
      ...normalizeJarBudgetState(jar),
      carryovers: closingCarryovers,
      transferredIn: [],
      cycleAllocation: 0,
      targetBudget,
      currentSpent: 0,
      lastRolloverCycleStart: cycleKey,
    };
  });
}

export function applyCurrentCycleSpending(
  jars: Jar[],
  transactions: Transaction[],
  resetDay: number,
  now = new Date(),
) {
  const cycleStart = getFinancialCycleStart(now, resetDay);
  const cycleEnd = getNextFinancialCycleStart(cycleStart, resetDay);
  const expenseByJar = getExpenseByJar(
    getCycleTransactions(transactions, cycleStart, cycleEnd)
  );
  return jars.map((jar) => ({
    ...normalizeJarBudgetState(jar),
    currentSpent: expenseByJar[jar.id] || 0,
  }));
}

export function applyCorrectedCarryoversToCurrentJars(
  jars: Jar[],
  correctedSummary: MonthlyCycleSummary,
  transactions: Transaction[],
  resetDay: number,
  now = new Date(),
) {
  const correctedByJarId = new Map(
    (correctedSummary.jarBreakdown || [])
      .filter((item) => !item.isArchived)
      .map((item) => [item.jarId, item.closingCarryovers] as const),
  );
  const correctedJars = jars.map((rawJar) => {
    const jar = normalizeJarBudgetState(rawJar);
    const correctedCarryovers = correctedByJarId.get(jar.id);
    if (!correctedCarryovers) return jar;
    return normalizeJarBudgetState({
      ...jar,
      carryovers: correctedCarryovers.map((source) => ({ ...source })),
    });
  });
  return applyCurrentCycleSpending(correctedJars, transactions, resetDay, now);
}

export function createMonthlyCycleSummary(
  cycleStart: Date,
  cycleEnd: Date,
  transactions: Transaction[],
  jars: Jar[],
  fallbackIncome: number,
  excludedCarryForwardJarIds: ReadonlySet<string> = new Set(),
): MonthlyCycleSummary {
  const cycleTransactions = getCycleTransactions(transactions, cycleStart, cycleEnd);
  const expenseByJar = getExpenseByJar(cycleTransactions);
  const cycleEndInclusive = new Date(cycleEnd);
  cycleEndInclusive.setDate(cycleEndInclusive.getDate() - 1);
  const jarBreakdown = jars.map((rawJar) => {
    const jar = normalizeJarBudgetState(rawJar);
    const spent = expenseByJar[jar.id] || 0;
    const closingCarryovers = getClosingCarryovers(jar, cycleStart, cycleEnd, spent);
    return {
      jarId: jar.id,
      jarCode: jar.code,
      jarName: jar.name,
      openingCarryover: getCarryoverTotal(jar),
      openingCarryovers: jar.carryovers || [],
      transferredIn: jar.transferredIn || [],
      transferredInAmount: getTransferredInTotal(jar),
      cycleAllocation: jar.cycleAllocation || 0,
      availableBudget: jar.targetBudget,
      spent,
      remaining: closingCarryovers.reduce((total, item) => total + item.amount, 0),
      closingCarryovers,
      isArchived: excludedCarryForwardJarIds.has(jar.id),
    };
  });

  return {
    id: toLocalDateKey(cycleStart),
    cycleStart: toLocalDateKey(cycleStart),
    cycleEnd: toLocalDateKey(cycleEndInclusive),
    income: Math.max(0, fallbackIncome),
    expense: Object.values(expenseByJar).reduce((total, amount) => total + amount, 0),
    transactionCount: cycleTransactions.length,
    spendingByJar: jars.map((jar) => ({
      jarId: jar.id,
      amount: expenseByJar[jar.id] || 0,
    })),
    jarBreakdown,
    carriedForward: jarBreakdown.reduce(
      (total, item) => total + (item.isArchived ? 0 : item.remaining),
      0,
    ),
    createdAt: new Date().toISOString(),
  };
}

export function adjustMonthlySummaryIncome(
  summaries: MonthlyCycleSummary[],
  transactionDate: string,
  amountDelta: number,
) {
  const date = parseLocalDate(transactionDate);
  if (!date || !Number.isFinite(amountDelta)) return summaries;
  return summaries.map((summary) => {
    const cycleStart = parseLocalDate(summary.cycleStart);
    const cycleEnd = parseLocalDate(summary.cycleEnd);
    if (!cycleStart || !cycleEnd || date < cycleStart || date > cycleEnd) return summary;
    return { ...summary, income: Math.max(0, summary.income + amountDelta) };
  });
}

export function adjustCompletedCycleIncome(
  summaries: MonthlyCycleSummary[],
  transactionDate: string,
  amountDelta: number,
  allocationDeltas: { jarId: string; amount: number }[],
) {
  const date = parseLocalDate(transactionDate);
  if (!date || !Number.isFinite(amountDelta)) return summaries;
  const deltaByJarId = allocationDeltas.reduce<Record<string, number>>((totals, allocation) => {
    if (Number.isFinite(allocation.amount)) {
      totals[allocation.jarId] = (totals[allocation.jarId] || 0) + allocation.amount;
    }
    return totals;
  }, {});

  return summaries.map((summary) => {
    const cycleStart = parseLocalDate(summary.cycleStart);
    const cycleEndInclusive = parseLocalDate(summary.cycleEnd);
    if (!cycleStart || !cycleEndInclusive || date < cycleStart || date > cycleEndInclusive) {
      return summary;
    }
    const cycleEnd = new Date(cycleEndInclusive);
    cycleEnd.setDate(cycleEnd.getDate() + 1);
    const jarBreakdown = summary.jarBreakdown?.map((snapshot) => {
      const cycleAllocation = Math.max(
        0,
        Math.round(snapshot.cycleAllocation + (deltaByJarId[snapshot.jarId] || 0)),
      );
      const openingCarryovers = snapshot.openingCarryovers?.length
        ? snapshot.openingCarryovers
        : snapshot.openingCarryover > 0
          ? [{
              sourceCycleStart: summary.cycleStart,
              sourceCycleEnd: summary.cycleEnd,
              amount: snapshot.openingCarryover,
            }]
          : [];
      const transferredIn = snapshot.transferredIn || [];
      const budgetJar: Jar = {
        id: snapshot.jarId,
        code: snapshot.jarCode,
        name: snapshot.jarName,
        percentage: 0,
        bankName: '',
        bankCode: '',
        accountNumber: '',
        accountName: '',
        color: '#6366f1',
        description: '',
        targetBudget: 0,
        currentSpent: snapshot.spent,
        carryovers: openingCarryovers,
        transferredIn,
        cycleAllocation,
      };
      const normalized = normalizeJarBudgetState(budgetJar);
      const closingCarryovers = getClosingCarryovers(
        normalized,
        cycleStart,
        cycleEnd,
        snapshot.spent,
      );
      return {
        ...snapshot,
        cycleAllocation,
        availableBudget: normalized.targetBudget,
        remaining: closingCarryovers.reduce((total, item) => total + item.amount, 0),
        closingCarryovers,
      };
    });
    return {
      ...summary,
      income: Math.max(0, summary.income + amountDelta),
      jarBreakdown,
      carriedForward: jarBreakdown?.reduce(
        (total, item) => total + (item.isArchived ? 0 : item.remaining),
        0,
      ) ?? summary.carriedForward,
    };
  });
}

export function rebuildMonthlyCycleSummaries(
  summaries: MonthlyCycleSummary[],
  transactions: Transaction[],
  jars: Jar[],
  fallbackIncome: number,
) {
  return summaries.map((summary) => {
    const cycleStart = parseLocalDate(summary.cycleStart);
    const cycleEndInclusive = parseLocalDate(summary.cycleEnd);
    if (!cycleStart || !cycleEndInclusive) return summary;
    const cycleEnd = new Date(cycleEndInclusive);
    cycleEnd.setDate(cycleEnd.getDate() + 1);
    const snapshotJars = summary.jarBreakdown?.map((snapshot) => {
      const reference = jars.find((jar) => jar.id === snapshot.jarId);
      const openingCarryovers = snapshot.openingCarryovers?.length
        ? snapshot.openingCarryovers
        : snapshot.openingCarryover > 0
          ? [{
              sourceCycleStart: summary.cycleStart,
              sourceCycleEnd: summary.cycleEnd,
              amount: snapshot.openingCarryover,
            }]
          : [];
      return {
        id: snapshot.jarId,
        code: snapshot.jarCode,
        name: snapshot.jarName,
        percentage: reference?.percentage || 0,
        bankName: reference?.bankName || 'Chưa cấu hình',
        bankCode: reference?.bankCode || '',
        accountNumber: reference?.accountNumber || '',
        accountName: reference?.accountName || '',
        color: reference?.color || '#6366f1',
        description: reference?.description || '',
        targetBudget: snapshot.availableBudget,
        currentSpent: snapshot.spent,
        carryovers: openingCarryovers,
        transferredIn: snapshot.transferredIn || [],
        cycleAllocation: snapshot.cycleAllocation,
      } satisfies Jar;
    });
    const archivedIds = new Set(
      summary.jarBreakdown
        ?.filter((snapshot) => snapshot.isArchived)
        .map((snapshot) => snapshot.jarId) || [],
    );
    return {
      ...createMonthlyCycleSummary(
        cycleStart,
        cycleEnd,
        transactions,
        snapshotJars || jars,
        summary.income ?? fallbackIncome,
        archivedIds,
      ),
      createdAt: summary.createdAt,
    };
  });
}

export function formatCycleDate(date: Date, language: 'vi' | 'en' = 'vi') {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
