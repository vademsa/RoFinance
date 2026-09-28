import { DebtItem, Jar } from '../types';

interface DebtPlanInput {
  calculationMode: 'total' | 'calculated';
  totalDebt: number;
  principalAmount: number;
  interestRate: number;
  interestRatePeriod: 'annual' | 'monthly';
  conversionFee: number;
  conversionFeePercent: number;
  conversionFeeMode: 'upfront' | 'distributed';
  months: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateDebtPaymentPlan(input: DebtPlanInput) {
  const months = Math.max(1, input.months);
  const interestAmount =
    input.calculationMode === 'calculated'
      ? roundMoney(
          input.principalAmount *
            (input.interestRate / 100) *
            (input.interestRatePeriod === 'annual' ? months / 12 : months)
        )
      : 0;
  const conversionFee =
    input.calculationMode === 'calculated'
      ? roundMoney(input.principalAmount * (input.conversionFeePercent / 100))
      : Math.max(0, input.conversionFee);
  const totalDebt =
    input.calculationMode === 'calculated'
      ? roundMoney(input.principalAmount + interestAmount + conversionFee)
      : Math.max(0, input.totalDebt);
  const regularPayment =
    input.conversionFeeMode === 'upfront'
      ? roundMoney(Math.max(0, totalDebt - conversionFee) / months)
      : roundMoney(totalDebt / months);

  return {
    totalDebt,
    interestAmount,
    conversionFee,
    regularPayment,
    firstMonthPayment:
      input.conversionFeeMode === 'upfront'
        ? roundMoney(regularPayment + conversionFee)
        : regularPayment,
    distributedFeePerMonth:
      input.conversionFeeMode === 'distributed'
        ? roundMoney(conversionFee / months)
        : 0,
  };
}

/**
 * Calculates number of months between startMonth and endMonth inclusive.
 * e.g. "2026-01" to "2026-12" => 12 months.
 */
export function calculateMonthsCount(startMonth: string, endMonth: string): number {
  if (!startMonth || !endMonth) return 1;
  const [startYear, startM] = startMonth.split('-').map(Number);
  const [endYear, endM] = endMonth.split('-').map(Number);

  if (isNaN(startYear) || isNaN(startM) || isNaN(endYear) || isNaN(endM)) return 1;

  const monthDiff = (endYear - startYear) * 12 + (endM - startM) + 1;
  return Math.max(1, monthDiff);
}

/**
 * Calculate required monthly payment for a debt item.
 */
export function computeMonthlyPayment(
  totalAmount: number,
  startMonth: string,
  endMonth: string
): number {
  const months = calculateMonthsCount(startMonth, endMonth);
  return Math.round(totalAmount / months);
}

/**
 * Returns the amount that should be reserved for a debt in a given month.
 * Distributed fees are already included in monthlyPayment. Upfront fees are
 * added only in the debt's starting month.
 */
export function getEffectiveMonthlyDebtPayment(
  debt: DebtItem,
  referenceDate = new Date()
): number {
  const fee = debt.conversionFee || 0;
  const currentPeriod = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  const startPeriod = debt.startMonth?.slice(0, 7);
  const upfrontFeeThisMonth =
    debt.conversionFeeMode === 'upfront' && startPeriod === currentPeriod ? fee : 0;
  return debt.monthlyPayment + upfrontFeeThisMonth;
}

/**
 * Check if a debt item has expired based on endMonth or remaining balance.
 */
export function isDebtFullyPaid(debt: DebtItem, currentYYYYMM?: string): boolean {
  if (debt.status === 'paid' || debt.remainingAmount <= 0) return true;
  if (currentYYYYMM && debt.endMonth) {
    if (currentYYYYMM > debt.endMonth) return true;
  }
  return false;
}

/**
 * Recalculate percentage for all financial jars based on active debt list and monthly income.
 */
export interface DebtReallocationOptions {
  strategy?: 'FFA' | 'PROPORTIONAL';
  affectedJarCodes?: string[];
  fixedAmounts?: Record<string, number>;
}

export function recalculateJarsWithDebt(
  currentJars: Jar[],
  debtItems: DebtItem[],
  monthlyIncome: number,
  options: DebtReallocationOptions | 'FFA' | 'PROPORTIONAL' = 'PROPORTIONAL'
): Jar[] {
  const normalizedOptions: DebtReallocationOptions =
    typeof options === 'string' ? { strategy: options } : options;
  const strategy = normalizedOptions.strategy || 'PROPORTIONAL';
  const activeDebts = debtItems.filter((d) => d.status === 'active' && d.remainingAmount > 0);
  const totalMonthlyDebtPayment = activeDebts.reduce(
    (sum, debt) => sum + getEffectiveMonthlyDebtPayment(debt),
    0
  );
  const nonDebtJars = currentJars.filter((j) => j.code !== 'DEBT');
  const debtJar = currentJars.find((j) => j.code === 'DEBT');
  // A no-debt template intentionally has no DEBT jar. Keep its allocation intact
  // instead of reserving a hidden percentage that makes the visible total < 100%.
  if (!debtJar) return currentJars.map((jar) => ({ ...jar }));
  const fixedAmounts = normalizedOptions.fixedAmounts || {};
  const requestedAffectedCodes =
    strategy === 'FFA'
      ? nonDebtJars.map((jar) => jar.code)
      : normalizedOptions.affectedJarCodes || nonDebtJars.map((jar) => jar.code);
  const affectedCodes = new Set(
    requestedAffectedCodes.filter((code) => fixedAmounts[code] === undefined)
  );
  if (
    strategy === 'PROPORTIONAL' &&
    normalizedOptions.affectedJarCodes !== undefined &&
    affectedCodes.size === 0
  ) {
    return currentJars.map((jar) => ({ ...jar }));
  }
  if (affectedCodes.size === 0) {
    const fallback = nonDebtJars.find((jar) => fixedAmounts[jar.code] === undefined);
    if (fallback) affectedCodes.add(fallback.code);
  }

  const roundPercent = (value: number) => Number(value.toFixed(2));
  const fixedPercentages = new Map<string, number>();
  nonDebtJars.forEach((jar) => {
    if (!affectedCodes.has(jar.code)) {
      const fixedAmount = fixedAmounts[jar.code];
      const percentage =
        fixedAmount !== undefined && monthlyIncome > 0
          ? (fixedAmount / monthlyIncome) * 100
          : jar.percentage;
      fixedPercentages.set(jar.code, roundPercent(Math.max(0, percentage)));
    }
  });

  const allocateUnits = (weights: number[], totalUnits: number): number[] => {
    if (weights.length === 0) return [];
    const safeWeights = weights.map((weight) => Math.max(0, weight));
    const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
    const exactUnits = safeWeights.map((weight) =>
      weightTotal > 0 ? (totalUnits * weight) / weightTotal : totalUnits / weights.length
    );
    const units = exactUnits.map(Math.floor);
    let remainder = totalUnits - units.reduce((sum, value) => sum + value, 0);
    const remainderOrder = exactUnits
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);
    for (let index = 0; index < remainder; index += 1) {
      units[remainderOrder[index % remainderOrder.length].index] += 1;
    }
    return units;
  };

  const fixedEntries = [...fixedPercentages.entries()];
  let fixedTotalUnits = fixedEntries.reduce(
    (sum, [, percentage]) => sum + Math.round(percentage * 100),
    0
  );
  if (fixedTotalUnits > 10000) {
    const normalizedUnits = allocateUnits(
      fixedEntries.map(([, percentage]) => percentage),
      10000
    );
    fixedEntries.forEach(([code], index) => {
      fixedPercentages.set(code, normalizedUnits[index] / 100);
    });
    fixedTotalUnits = 10000;
  }
  const rawDebtPercent =
    monthlyIncome > 0 ? (totalMonthlyDebtPayment / monthlyIncome) * 100 : 0;
  const debtUnits = Math.min(
    Math.max(0, 10000 - fixedTotalUnits),
    Math.max(0, Math.round(rawDebtPercent * 100))
  );
  const debtPercent = debtUnits / 100;
  const distributableUnits = Math.max(0, 10000 - fixedTotalUnits - debtUnits);
  const affectedJars = nonDebtJars.filter((jar) => affectedCodes.has(jar.code));
  const allocatedPercentages = new Map<string, number>();
  let allocatedUnits: number[];
  if (strategy === 'FFA' && affectedJars.some((jar) => jar.code === 'FFA')) {
    const nonFfaJars = affectedJars.filter((jar) => jar.code !== 'FFA');
    const nonFfaRequestedUnits = nonFfaJars.map((jar) => (
      Math.max(0, Math.round(jar.percentage * 100))
    ));
    const nonFfaRequestedTotal = nonFfaRequestedUnits.reduce((sum, value) => sum + value, 0);
    const unitsByCode = new Map<string, number>();
    if (distributableUnits >= nonFfaRequestedTotal) {
      nonFfaJars.forEach((jar, index) => unitsByCode.set(jar.code, nonFfaRequestedUnits[index]));
      unitsByCode.set('FFA', distributableUnits - nonFfaRequestedTotal);
    } else {
      const reducedUnits = allocateUnits(
        nonFfaJars.map((jar) => jar.percentage),
        distributableUnits,
      );
      nonFfaJars.forEach((jar, index) => unitsByCode.set(jar.code, reducedUnits[index]));
      unitsByCode.set('FFA', 0);
    }
    allocatedUnits = affectedJars.map((jar) => unitsByCode.get(jar.code) || 0);
  } else {
    allocatedUnits = allocateUnits(
      affectedJars.map((jar) => jar.percentage),
      distributableUnits,
    );
  }
  affectedJars.forEach((jar, index) => {
    allocatedPercentages.set(jar.code, allocatedUnits[index] / 100);
  });

  const updatedNonDebt = nonDebtJars.map((jar) => {
    const percentage =
      allocatedPercentages.get(jar.code) ?? fixedPercentages.get(jar.code) ?? 0;
    const fixedAmount = fixedAmounts[jar.code];
    const cycleAllocation = fixedAmount !== undefined
      ? fixedAmount
      : Math.round((monthlyIncome * percentage) / 100);
    return {
      ...jar,
      percentage,
      cycleAllocation,
      targetBudget: cycleAllocation,
    };
  });
  const updatedDebtJar = debtJar
    ? {
        ...debtJar,
        percentage: debtPercent,
        cycleAllocation: Math.round((monthlyIncome * debtPercent) / 100),
        targetBudget: Math.round((monthlyIncome * debtPercent) / 100),
      }
    : null;
  return updatedDebtJar ? [...updatedNonDebt, updatedDebtJar] : updatedNonDebt;
}
