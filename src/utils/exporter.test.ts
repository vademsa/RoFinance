import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import type { Jar, Transaction } from '../types';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../lib/preferences';
import type { AnalyticsCycle } from './analytics';
import { buildExcelWorkbook, buildExportReportData } from './exporter';

const jar: Jar = {
  id: 'jar-1', code: 'NEC', name: 'Thiết yếu', percentage: 60,
  bankName: 'Ngân hàng A', bankCode: 'VCB', accountNumber: '1234', accountName: 'A',
  color: '#6366f1', description: '', targetBudget: 20_000_000, currentSpent: 4_000_000,
};

const oldTransaction: Transaction = {
  id: 'old', type: 'expense', amount: 300_000, jarId: 'jar-1',
  category: 'Ăn uống', date: '2026-08-26', description: '',
};

const currentTransaction: Transaction = {
  ...oldTransaction, id: 'current', amount: 4_000_000, date: '2026-09-26',
};

test('exports the selected financial cycle instead of current jars and transactions', () => {
  const selectedCycle: AnalyticsCycle = {
    id: '2026-08-25', start: '2026-08-25', end: '2026-09-24', isCurrent: false,
    income: 5_000_000, expense: 300_000, net: 4_700_000,
    budget: 3_000_000, allocation: 2_500_000, opening: 500_000,
    carryover: 2_700_000, transactionCount: 1, transactions: [oldTransaction],
    jars: [{
      jarId: 'jar-1', code: 'NEC', name: 'Thiết yếu', color: '#6366f1',
      budget: 3_000_000, allocation: 2_500_000, opening: 500_000,
      spent: 300_000, remaining: 2_700_000, archived: false, closingCarryovers: [],
    }],
  };

  const report = buildExportReportData([jar], [oldTransaction, currentTransaction], 30_000_000, [jar], selectedCycle);
  assert.equal(report.income, 5_000_000);
  assert.equal(report.totalAllocated, 3_000_000);
  assert.equal(report.totalSpent, 300_000);
  assert.deepEqual(report.reportTransactions.map((transaction) => transaction.id), ['old']);
  assert.equal(report.reportJars[0].targetBudget, 3_000_000);
  assert.equal(report.reportJars[0].currentSpent, 300_000);
  assert.equal(report.reportJars[0].percentage, 50);
  assert.equal(report.period, '2026-08-25 – 2026-09-24');
  assert.equal(report.detailsIncomplete, false);
});

test('unknown historical budget remains unknown in exports', () => {
  const selectedCycle: AnalyticsCycle = {
    id: '2026-08-25', start: '2026-08-25', end: '2026-09-24', isCurrent: false,
    income: 5_000_000, expense: 300_000, net: 4_700_000,
    budget: null, allocation: null, opening: null,
    carryover: null, transactionCount: 1, transactions: [oldTransaction],
    jars: [{
      jarId: 'jar-1', code: 'NEC', name: 'Thiết yếu', color: '#6366f1',
      budget: null, allocation: null, opening: null,
      spent: 300_000, remaining: null, archived: false, closingCarryovers: [],
    }],
  };

  const report = buildExportReportData([jar], [currentTransaction], 30_000_000, [jar], selectedCycle);
  assert.equal(report.totalAllocated, null);
  assert.equal(report.reportJars[0].targetBudget, null);
  assert.equal(report.reportJars[0].remaining, null);
  assert.equal(report.reportJars[0].percentage, null);
});

test('current-cycle export retains expenses from jars archived after spending', () => {
  const archivedJar = { ...jar, id: 'archived', code: 'PLAY', name: 'Giải trí' };
  const archivedExpense = { ...oldTransaction, id: 'archived-expense', jarId: 'archived', amount: 700_000 };
  const selectedCycle: AnalyticsCycle = {
    id: '2026-09-25', start: '2026-09-25', end: '2026-10-24', isCurrent: true,
    income: 30_000_000, expense: 4_700_000, net: 25_300_000,
    budget: 20_000_000, allocation: 20_000_000, opening: 0,
    carryover: 16_000_000, transactionCount: 2,
    transactions: [currentTransaction, archivedExpense],
    jars: [{
      jarId: 'jar-1', code: 'NEC', name: 'Thiết yếu', color: '#6366f1',
      budget: 20_000_000, allocation: 20_000_000, opening: 0,
      spent: 4_000_000, remaining: 16_000_000, archived: false, closingCarryovers: [],
    }],
  };

  const report = buildExportReportData([jar], selectedCycle.transactions, selectedCycle.income, [jar, archivedJar], selectedCycle);
  assert.equal(report.reportJars.length, 2);
  assert.equal(report.reportJars.find((row) => row.code === 'PLAY')?.currentSpent, 700_000);
  assert.equal(report.reportJars.find((row) => row.code === 'PLAY')?.archivedSpendOnly, true);
  assert.equal(report.totalAllocated, 20_700_000);
  assert.equal(report.totalAllocated! - report.totalSpent, selectedCycle.carryover);
  assert.equal(report.reportJars.reduce((sum, row) => sum + row.currentSpent, 0), report.totalSpent);
});

test('historical export flags incomplete transaction details', () => {
  const selectedCycle: AnalyticsCycle = {
    id: '2026-08-25', start: '2026-08-25', end: '2026-09-24', isCurrent: false,
    income: 5_000_000, expense: 900_000, net: 4_100_000,
    budget: null, allocation: null, opening: null,
    carryover: null, transactionCount: 3, transactions: [oldTransaction], jars: [],
  };
  const report = buildExportReportData([jar], [oldTransaction], selectedCycle.income, [jar], selectedCycle);
  assert.equal(report.detailsIncomplete, true);
  assert.equal(report.totalSpent, 900_000);
  assert.equal(report.reportTransactions.length, 1);
});

test('Excel overview income and expense are numeric currency cells in VND and USD', () => {
  try {
    for (const currency of ['VND', 'USD'] as const) {
      setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, currency });
      const workbook = buildExcelWorkbook([jar], [currentTransaction], 30_000_000, [jar]);
      const saved = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const reopened = XLSX.read(saved, { type: 'buffer', cellNF: true });
      const overview = reopened.Sheets['Tổng Quan'];
      const jarSheet = reopened.Sheets['Báo Cáo Hũ Tài Chính'];
      const transactionSheet = reopened.Sheets['Lịch Sử Giao Dịch'];
      const symbol = currency === 'USD' ? '$' : '₫';

      for (const cell of [overview.B3, overview.B4, jarSheet.G2, jarSheet.H2, transactionSheet.F2]) {
        assert.equal(cell.t, 'n');
        assert.notEqual(cell.z, 'General');
        assert.match(cell.z, new RegExp(symbol === '$' ? '\\$' : symbol));
      }
      assert.equal(overview.B3.v, currency === 'USD' ? 30_000_000 / 26_000 : 30_000_000);
      assert.equal(overview.B4.v, currency === 'USD' ? 4_000_000 / 26_000 : 4_000_000);
    }
  } finally {
    setRuntimePreferences(DEFAULT_APP_PREFERENCES);
  }
});
