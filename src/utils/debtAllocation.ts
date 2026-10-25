import type { DebtItem, Jar } from '../types';
import { getEffectiveMonthlyDebtPayment, recalculateJarsWithDebt, type DebtReallocationOptions } from './debtCalculator';
import { percentUnits } from '../../shared/jarAllocation';

export type DebtAllocationError = 'income' | 'selection' | 'fixed' | 'shortfall';
export function createDebtAllocationProposal(jars: Jar[], debts: DebtItem[], income: number, options: DebtReallocationOptions):
  { jars: Jar[]; error?: never } | { jars?: never; error: DebtAllocationError } {
  if (!Number.isFinite(income) || income <= 0) return { error: 'income' };
  const eligible = jars.filter(jar => jar.code !== 'DEBT' && options.fixedAmounts?.[jar.code] === undefined &&
    (options.strategy === 'FFA' || !options.affectedJarCodes || options.affectedJarCodes.includes(jar.code)));
  if (!jars.some(jar => jar.code === 'DEBT') || !eligible.length) return { error: 'selection' };
  const fixed = Object.entries(options.fixedAmounts || {});
  if (fixed.some(([code, amount]) => !jars.some(jar => jar.code === code && code !== 'DEBT') ||
    !Number.isFinite(amount) || amount < 0 || amount > income)) return { error: 'fixed' };
  const calculated = recalculateJarsWithDebt(jars, debts, income, options);
  const proposed = jars.map(jar => calculated.find(item => item.id === jar.id)!);
  if (proposed.reduce((sum, jar) => sum + percentUnits(jar.percentage), 0) !== 10000 ||
    jars.some(jar => jar.code !== 'DEBT' && !eligible.some(item => item.id === jar.id) &&
      percentUnits(proposed.find(item => item.id === jar.id)!.percentage) !== percentUnits(
        options.fixedAmounts?.[jar.code] === undefined ? jar.percentage : options.fixedAmounts[jar.code] / income * 100))) return { error: 'fixed' };
  const payment = debts.filter(debt => debt.status === 'active' && debt.remainingAmount > 0)
    .reduce((sum, debt) => sum + getEffectiveMonthlyDebtPayment(debt), 0);
  if (payment - (proposed.find(jar => jar.code === 'DEBT')?.cycleAllocation || 0) > 1) return { error: 'shortfall' };
  return { jars: proposed };
}
