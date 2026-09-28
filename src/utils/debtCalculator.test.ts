import assert from 'node:assert/strict';
import test from 'node:test';
import type { DebtItem, Jar } from '../types';
import { recalculateJarsWithDebt } from './debtCalculator';

test('debt recalculation leaves a no-debt jar plan at 100 percent', () => {
  const jars = [
    { id: 'nec', code: 'NEC', name: 'Thiết yếu', percentage: 60 },
    { id: 'safe', code: 'SAFE', name: 'An toàn', percentage: 40 },
  ].map((jar) => ({
    ...jar,
    bankName: 'Chưa cấu hình', bankCode: '', accountNumber: '', accountName: '',
    color: '#000', description: '', targetBudget: 0, currentSpent: 0,
  })) as Jar[];
  const debts: DebtItem[] = [{
    id: 'debt-1', name: 'Khoản vay', totalAmount: 1_000_000,
    remainingAmount: 1_000_000, startMonth: '2026-08-01', endMonth: '2027-08-01',
    monthlyPayment: 100_000, status: 'active',
  }];
  const result = recalculateJarsWithDebt(jars, debts, 10_000_000);
  assert.deepEqual(result.map((jar) => jar.percentage), [60, 40]);
  assert.equal(result.reduce((sum, jar) => sum + jar.percentage, 0), 100);
});

const financeJar = (code: string, percentage: number): Jar => ({
  id: `jar-${code.toLowerCase()}`,
  code,
  name: code,
  percentage,
  bankName: 'Chưa cấu hình',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  color: '#000',
  description: '',
  targetBudget: percentage * 100_000,
  currentSpent: 0,
  cycleAllocation: percentage * 100_000,
});

const activeDebt = (monthlyPayment: number): DebtItem => ({
  id: 'debt-active',
  name: 'Khoản nợ đang trả',
  totalAmount: monthlyPayment * 12,
  remainingAmount: monthlyPayment * 12,
  startMonth: '2026-01-01',
  endMonth: '2026-12-31',
  monthlyPayment,
  status: 'active',
});

test('FFA strategy fully funds DEBT and spills proportionally when FFA is insufficient', () => {
  const result = recalculateJarsWithDebt(
    [
      financeJar('NEC', 40),
      financeJar('SAFE', 10),
      financeJar('FFA', 10),
      financeJar('PLAY', 10),
      financeJar('DEBT', 30),
    ],
    [activeDebt(5_000_000)],
    10_000_000,
    { strategy: 'FFA' },
  );
  const debtJar = result.find((jar) => jar.code === 'DEBT');
  const ffaJar = result.find((jar) => jar.code === 'FFA');

  assert.equal(debtJar?.percentage, 50);
  assert.equal(debtJar?.cycleAllocation, 5_000_000);
  assert.equal(debtJar?.targetBudget, 5_000_000);
  assert.equal(ffaJar?.percentage, 0);
  assert.equal(result.reduce((sum, jar) => sum + jar.percentage, 0), 100);
  assert.equal(result.reduce((sum, jar) => sum + (jar.cycleAllocation || 0), 0), 10_000_000);
});

test('FFA strategy leaves other jars unchanged when FFA can cover the debt increase', () => {
  const result = recalculateJarsWithDebt(
    [financeJar('NEC', 40), financeJar('FFA', 30), financeJar('DEBT', 30)],
    [activeDebt(4_000_000)],
    10_000_000,
    { strategy: 'FFA' },
  );

  assert.equal(result.find((jar) => jar.code === 'NEC')?.percentage, 40);
  assert.equal(result.find((jar) => jar.code === 'FFA')?.percentage, 20);
  assert.equal(result.find((jar) => jar.code === 'DEBT')?.percentage, 40);
});
