import assert from 'node:assert/strict';
import test from 'node:test';
import type { SafetyInvestment } from '../types';
import {
  addSafetyInvestmentWithdrawal,
  calculateSafetyInvestmentReturn,
  getSafetyInvestmentRemaining,
  getSafetyInvestmentWithdrawn,
} from './safetyInvestments';

const investment: SafetyInvestment = {
  id: 'safe-1',
  providerType: 'bank',
  providerName: 'Test Bank',
  productName: 'Tiết kiệm',
  principalAmount: 10_000_000,
  annualInterestRate: 6,
  startDate: '2026-01-01',
  maturityDate: '2027-01-01',
};

test('partial safety withdrawal preserves original principal and reduces remaining capital', () => {
  const updated = addSafetyInvestmentWithdrawal(investment, {
    id: 'withdrawal-1',
    amount: 3_000_000,
    date: '2026-08-29',
    createdAt: '2026-08-29T10:00:00.000Z',
  });
  assert.equal(updated.principalAmount, 10_000_000);
  assert.equal(getSafetyInvestmentWithdrawn(updated), 3_000_000);
  assert.equal(getSafetyInvestmentRemaining(updated), 7_000_000);
  assert.equal(calculateSafetyInvestmentReturn(updated).remainingPrincipal, 7_000_000);
});

test('full withdrawal leaves a zero balance while retaining withdrawal history', () => {
  const updated = addSafetyInvestmentWithdrawal(investment, {
    id: 'withdrawal-full',
    amount: 10_000_000,
    date: '2026-08-29',
    createdAt: '2026-08-29T10:00:00.000Z',
  });
  assert.equal(getSafetyInvestmentRemaining(updated), 0);
  assert.equal(updated.withdrawals?.length, 1);
  assert.equal(calculateSafetyInvestmentReturn(updated).maturityValue, 0);
});

test('withdrawal cannot exceed the remaining safety capital', () => {
  assert.throws(() => addSafetyInvestmentWithdrawal(investment, {
    id: 'withdrawal-too-large',
    amount: 10_000_001,
    date: '2026-08-29',
    createdAt: '2026-08-29T10:00:00.000Z',
  }), /vượt quá vốn còn lại/);
});
