import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import type { Jar, Transaction } from '../../src/types';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../../src/lib/preferences';
import type { AnalyticsCycle } from '../../src/utils/analytics';
import { buildExcelFile, buildExcelWorkbook, buildExportReportData } from '../../src/utils/exporter';

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

test('Excel groups actual transactions by type/category, adds outline subtotals and preserves every ID and saved name', () => {
  const transactions: Transaction[] = [
    { ...currentTransaction, id: 'b1', category: 'Nhóm B', amount: 100 },
    { ...currentTransaction, id: 'a1', category: 'Nhóm A', amount: 200 },
    { ...currentTransaction, id: 'b2', category: 'Nhóm B', amount: 300, date: '2026-09-27' },
    { ...currentTransaction, id: 'income-a', type: 'income', category: 'Nhóm A', amount: 400 },
    { ...currentTransaction, id: 'transfer-a', type: 'transfer', category: 'Nhóm A', amount: 500 },
  ];
  const before = structuredClone(transactions);
  const workbook = buildExcelWorkbook([jar], transactions, 400, [jar]);
  const sheet = workbook.Sheets['Lịch Sử Giao Dịch'];
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);
  const actual = rows.filter(row => row['Mã Giao Dịch'] !== 'TỔNG DANH MỤC');
  assert.deepEqual(actual.map(row => row['Mã Giao Dịch']), ['a1', 'b2', 'b1', 'income-a', 'transfer-a']);
  const summary = rows.filter(row => row['Mã Giao Dịch'] === 'TỔNG DANH MỤC');
  assert.deepEqual(summary.map(row => row['Số Tiền (₫)']), [200, 400, 400, 500]);
  assert.equal(sheet.F6.f, 'SUM(F4:F5)');
  assert.equal(sheet['!rows']?.[1].level, 1);
  assert.equal(sheet['!rows']?.[2].level, 0);
  const categories = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets['Danh Mục Thu Chi']);
  assert.equal(categories.length, 3); // transfers never become income/expenses
  assert.deepEqual(categories.map(row => [row['Loại'], row['Danh Mục'], row['Số Giao Dịch'], row['Số Tiền (₫)']]), [
    ['Chi tiêu', 'Nhóm B', 2, 400], ['Chi tiêu', 'Nhóm A', 1, 200], ['Thu nhập', 'Nhóm A', 1, 400],
  ]);
  assert.deepEqual(transactions, before);
});

test('downloaded Excel contains native editable charts with cell references, safe names, currency and actual cached data', () => {
  const transactions: Transaction[] = [
    { ...currentTransaction, id: 'expense-custom', category: 'Custom <&> "name"', categoryId: 'custom-one', amount: 123456 },
    { ...currentTransaction, id: 'income-custom', type: 'income', category: '=WEBSERVICE("https://invalid.example")', amount: 654321 },
  ];
  try {
    for (const currency of ['VND', 'USD'] as const) {
      setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, currency });
      const bytes = buildExcelFile([jar], transactions, 1000000, [jar]);
      const files = unzipSync(bytes);
      const charts = Object.entries(files).filter(([name]) => /^xl\/charts\/rofinance-chart-\d\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes));
      assert.equal(charts.length, 4);
      assert.equal(charts.filter(xml => xml.includes('<c:pieChart>')).length, 2);
      assert.equal(charts.filter(xml => xml.includes('<c:barChart>')).length, 2);
      assert.ok(charts.every(xml => xml.includes('<c:f>') && xml.includes('<c:numCache>')));
      assert.ok(charts.some(xml => xml.includes('Custom &lt;&amp;&gt; &quot;name&quot;')));
      assert.ok(charts.some(xml => xml.includes(String(currency === 'USD' ? 123456 / 26000 : 123456))));
      assert.match(strFromU8(files['xl/worksheets/sheet5.xml']), /r:id="rofinanceCharts"/);
      assert.match(strFromU8(files['[Content_Types].xml']), /drawingml.chart\+xml/);
      for (const [name, xml] of Object.entries(files).filter(([name]) => name.endsWith('.rels'))) assert.doesNotMatch(strFromU8(xml), /TargetMode="External"/, name);
      const reopened = XLSX.read(bytes, { type: 'array', cellNF: true });
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(reopened.Sheets['Lịch Sử Giao Dịch']);
      assert.equal(rows.filter(row => row['Mã Giao Dịch'] === 'income-custom')[0]['Danh Mục'], transactions[1].category);
      assert.equal(reopened.Sheets['Lịch Sử Giao Dịch'].E4.t, 's');
      assert.equal(reopened.Sheets['Lịch Sử Giao Dịch'].E4.f, undefined);
      assert.match(reopened.Sheets['Danh Mục Thu Chi'].D2.z!, currency === 'USD' ? /\$/ : /₫/);
    }
  } finally { setRuntimePreferences(DEFAULT_APP_PREFERENCES); }
});

test('empty history and unknown historical budgets do not invent pie slices or budget values', () => {
  const bytes = buildExcelFile([], [], 0);
  const files = unzipSync(bytes);
  const charts = Object.entries(files).filter(([name]) => name.startsWith('xl/charts/')).map(([, bytes]) => strFromU8(bytes));
  assert.equal(charts.length, 1);
  assert.ok(charts.every(xml => !xml.includes('<c:pieChart>')));
});

test('historical Excel charts keep confirmed totals separate from incomplete category details and unknown budgets', () => {
  const cycle: AnalyticsCycle = {
    id: '2026-08-25', start: '2026-08-25', end: '2026-09-24', isCurrent: false,
    income: 5000000, expense: 900000, net: 4100000, budget: null, allocation: null, opening: null, carryover: null,
    transactionCount: 3, transactions: [oldTransaction],
    jars: [{ jarId: jar.id, code: jar.code, name: jar.name, color: jar.color, budget: null, allocation: null, opening: null, spent: 300000, remaining: null, archived: false, closingCarryovers: [] }],
  };
  const bytes = buildExcelFile([jar], [oldTransaction, currentTransaction], 30000000, [jar], cycle);
  const files = unzipSync(bytes);
  const workbook = XLSX.read(bytes, { type: 'array' });
  assert.equal(workbook.Sheets['Tổng Quan'].B3.v, 5000000);
  assert.equal(workbook.Sheets['Tổng Quan'].B4.v, 900000);
  assert.equal(workbook.Sheets['Danh Mục Thu Chi'].D2.v, 300000);
  assert.deepEqual(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Lịch Sử Giao Dịch']).map(row => row['Mã Giao Dịch']), ['old', 'TỔNG DANH MỤC']);
  assert.match(strFromU8(files['xl/charts/rofinance-chart-2.xml']), /<c:v>300000<\/c:v>/);
  const firstBudgetSeries = strFromU8(files['xl/charts/rofinance-chart-3.xml']).match(/<c:ser>[\s\S]*?<\/c:ser>/)![0];
  const budgetCache = firstBudgetSeries.match(/<c:val>[\s\S]*?<\/c:val>/)![0];
  assert.doesNotMatch(budgetCache, /<c:pt idx=/); // a missing budget is a gap, not a fabricated zero
});
