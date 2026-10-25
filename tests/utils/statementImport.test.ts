import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStatementSheet, filterStatementRowsByDateRange, parseStatementAmount, parseStatementDate, parseStatementRows, statementBankId } from '../../src/utils/statementImport';
import { getFinancialCycleStart, parseLocalDate, toLocalDateKey } from '../../src/utils/monthlyCycle';

test('Techcombank layout parses debit and credit rows but skips footer totals', () => {
  const rows = Array.from({ length: 4 }, () => Array(43).fill('')) as string[][];
  Object.assign(rows[0], { 1: 'Ngày giao dịch\nTransaction Date', 17: 'Diễn giải\nDetails',
    21: 'Số bút toán\nTransaction No', 31: 'Nợ TKTT\nDebit', 37: 'Có TKTT\nCredit' });
  Object.assign(rows[1], { 1: '04/10/2026', 17: 'Thanh toán', 21: 'REF-1', 31: '30,000' });
  Object.assign(rows[2], { 1: '05/10/2026', 17: 'Hoàn tiền', 21: 'REF-2', 37: '20,000' });
  Object.assign(rows[3], { 1: 'Tổng cộng', 31: '30,000', 37: '20,000' });
  const sheet = detectStatementSheet(rows);
  const result = parseStatementRows(sheet);
  assert.equal(sheet.format, 'techcombank');
  assert.deepEqual(result.rows.map(({ date, type, amount }) => ({ date, type, amount })), [
    { date: '2026-10-04', type: 'expense', amount: 30_000 },
    { date: '2026-10-05', type: 'income', amount: 20_000 },
  ]);
  assert.deepEqual(result.errors, []);
});

test('rejects invalid dates and amounts without guessing', () => {
  assert.equal(parseStatementDate('31/09/2026'), null);
  assert.equal(parseStatementDate('2026-10-05'), '2026-10-05');
  assert.equal(parseStatementAmount('1,234,567'), 1_234_567);
  assert.equal(parseStatementAmount('1.234.567'), 1_234_567);
  assert.equal(parseStatementAmount('1,234.50'), null);
  assert.equal(statementBankId('TCB', '123456789', 'REF-1'), 'TCB:123456789:REF-1');
});

test('date range includes both ends while salary cycle follows each transaction date', () => {
  const rows = ['2026-09-06', '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-06']
    .map((date, index) => ({ rowNumber: index + 1, date, type: 'expense' as const,
      amount: 100, description: `row-${index}`, reference: `ref-${index}` }));
  const selected = filterStatementRowsByDateRange(rows, '2026-09-06', '2026-10-05');
  assert.deepEqual(selected.map((row) => row.date),
    ['2026-09-06', '2026-09-24', '2026-09-25', '2026-10-05']);
  assert.deepEqual(selected.map((row) => toLocalDateKey(getFinancialCycleStart(parseLocalDate(row.date)!, 25))),
    ['2026-08-25', '2026-08-25', '2026-09-25', '2026-09-25']);
  assert.throws(() => filterStatementRowsByDateRange(rows, '2026-10-05', '2026-09-06'));
});
