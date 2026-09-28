import type { SafetyInvestment, SafetyInvestmentWithdrawal } from '../types';

export function getSafetyInvestmentWithdrawn(investment: SafetyInvestment) {
  return (investment.withdrawals || []).reduce(
    (total, withdrawal) => total + Math.max(0, Number(withdrawal.amount) || 0),
    0,
  );
}

export function getSafetyInvestmentRemaining(investment: SafetyInvestment) {
  return Math.max(0, investment.principalAmount - getSafetyInvestmentWithdrawn(investment));
}

export function calculateSafetyInvestmentReturn(investment: SafetyInvestment) {
  const start = new Date(`${investment.startDate}T00:00:00`);
  const end = new Date(`${investment.maturityDate}T00:00:00`);
  const durationDays = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
  const remainingPrincipal = getSafetyInvestmentRemaining(investment);
  const expectedInterest =
    remainingPrincipal *
    (Math.max(0, investment.annualInterestRate) / 100) *
    (durationDays / 365);
  return {
    durationDays,
    remainingPrincipal,
    expectedInterest: Math.round(expectedInterest),
    maturityValue: Math.round(remainingPrincipal + expectedInterest),
  };
}

export function addSafetyInvestmentWithdrawal(
  investment: SafetyInvestment,
  withdrawal: SafetyInvestmentWithdrawal,
) {
  const remaining = getSafetyInvestmentRemaining(investment);
  if (!Number.isFinite(withdrawal.amount) || withdrawal.amount <= 0) {
    throw new Error('Số tiền rút phải lớn hơn 0.');
  }
  if (withdrawal.amount > remaining) {
    throw new Error('Số tiền rút không được vượt quá vốn còn lại.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(withdrawal.date) || withdrawal.date < investment.startDate) {
    throw new Error('Ngày rút không được trước ngày bắt đầu khoản gửi.');
  }
  return {
    ...investment,
    withdrawals: [...(investment.withdrawals || []), withdrawal],
  };
}
