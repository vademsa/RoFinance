import assert from 'node:assert/strict';
import test from 'node:test';
import type { BankAccount, Jar, Transaction } from '../../src/types';
import { getBankAccountBalance, getBankOpeningBalance, syncBankAccountsWithJars } from '../../src/utils/bankAccounts';
import { syncBankTransactionSummaries } from '../../src/utils/bankIncome';
import { applyCurrentCycleSpending, createMonthlyCycleSummary, rebuildMonthlyCycleSummaries } from '../../src/utils/monthlyCycle';
import { buildAnalyticsCycles } from '../../src/utils/analytics';
import { buildExcelWorkbook, buildExportReportData } from '../../src/utils/exporter';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import { validateCustomCategories } from '../../server/categoryValidation';
import { getTransactionCategories } from '../../src/constants/categories';

const now = new Date(2026, 9, 21, 12);
const account: BankAccount = { id: 'bank-business', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 1000000, openingBalance: 1000000, balanceReconciled: true, status: 'connected', lastSynced: '', isManuallyAdded: true };
const jar: Jar = { id: 'jar', code: 'NEC', name: 'Essentials', percentage: 100, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST', color: '#6366f1', description: '', targetBudget: 500000, cycleAllocation: 500000, currentSpent: 0, carryovers: [], transferredIn: [] };
const expense = (amount = 200000, date = '2026-10-21', bankAccountId = account.id): Transaction => ({ id: 'business-expense', type: 'expense', amount, date, bankAccountId, jarId: '', category: 'Khác', description: 'Business purchase', paymentMethodCode: 'TCB' });

test('direct expenses debit only the selected bank, survive repeated sync/reload, and reverse on edit/delete', () => {
  const snapshot = structuredClone(jar), tx = expense();
  let accounts = syncBankAccountsWithJars([], [account], [tx]);
  assert.equal(accounts[0].balance, 800000);
  accounts = syncBankAccountsWithJars([], JSON.parse(JSON.stringify(accounts)), [tx]);
  assert.equal(accounts[0].balance, 800000);
  assert.equal(syncBankAccountsWithJars([], accounts, [expense(300000)])[0].balance, 700000);
  assert.equal(syncBankAccountsWithJars([], accounts, [])[0].balance, 1000000);
  assert.equal(syncBankAccountsWithJars([], accounts, [expense(200000, undefined, 'other')])[0].balance, 1000000);
  const jars = applyCurrentCycleSpending([jar], [tx], 25, now);
  assert.deepEqual(jars, [snapshot]);
  assert.equal(getBankAccountBalance([jar], account, [tx]), 800000);
  const receipt = { ...tx, id: 'receipt', type: 'income' as const, amount: 100000 };
  assert.equal(getBankAccountBalance([jar], account, [tx, receipt]), 900000);
  const auto = { ...account, isManuallyAdded: false };
  assert.equal(syncBankAccountsWithJars([], [auto], [tx])[0].balance, 800000);
});
test('manual reconciliation uses only actual cash flow, ignoring jar limits', () => {
  const tx = expense();
  const opening = getBankOpeningBalance([jar], account, [tx], 900000);
  assert.equal(opening, 1100000);
  assert.equal(getBankAccountBalance([jar], { ...account, openingBalance: opening }, [tx]), 900000);
});
test('cycle summaries and analytics include direct expenses once without creating fake jar budgets', () => {
  const tx = expense();
  const summary = createMonthlyCycleSummary(new Date(2026, 8, 25), new Date(2026, 9, 25), [tx], [jar], 500000);
  assert.equal(summary.expense, 200000); assert.equal(summary.unallocatedExpense, 200000);
  assert.equal(summary.spendingByJar[0].amount, 0); assert.equal(summary.jarBreakdown![0].spent, 0);
  assert.equal(summary.carriedForward, 500000);
  assert.equal(rebuildMonthlyCycleSummaries([summary], [tx], [jar], 500000)[0].expense, 200000);
  const cycle = buildAnalyticsCycles({ jars: [jar], jarRegistry: [jar], transactions: [tx], summaries: [], monthlyIncome: 500000, resetDay: 25, now }).find(c => c.isCurrent)!;
  assert.equal(cycle.expense, 200000); assert.equal(cycle.jars[0].spent, 0);
  const report = buildExportReportData([jar], [tx], 500000, [jar], cycle);
  assert.equal(report.totalSpent, 200000); assert.equal(report.totalJarSpent, 0); assert.equal(report.bankExpenseTotal, 200000);
  assert.equal(report.totalAllocated, 500000); assert.equal(report.reportJars.length, 1);
  const workbook = buildExcelWorkbook([jar], [tx], 500000, [jar], cycle);
  assert.ok(JSON.stringify(workbook).includes('Ngoài hũ'));
});
test('backdated direct expenses need no jar snapshot, support cycle moves, edits and deletion', () => {
  const old = [expense(200000, '2026-09-01')];
  let summaries = syncBankTransactionSummaries([], [], old, 25, now);
  assert.equal(summaries[0].cycleStart, '2026-08-25'); assert.equal(summaries[0].expense, 200000);
  assert.equal(summaries[0].transactionCount, 1); assert.deepEqual(summaries[0].jarBreakdown, []);
  const next = [expense(300000, '2026-08-01')];
  summaries = syncBankTransactionSummaries(summaries, old, next, 25, now);
  assert.equal(summaries.find(s => s.cycleStart === '2026-08-25')!.expense, 0);
  assert.equal(summaries.find(s => s.cycleStart === '2026-07-25')!.expense, 300000);
  summaries = syncBankTransactionSummaries(summaries, next, [], 25, now);
  assert.ok(summaries.every(s => s.expense === 0 && s.unallocatedExpense === 0 && s.transactionCount === 0));
});
test('bank-only history changes preserve personal jar snapshots, totals, income and carryover', () => {
  const personal: Transaction = { ...expense(10000, '2026-09-01'), id: 'personal', bankAccountId: undefined, jarId: jar.id };
  const summary = createMonthlyCycleSummary(new Date(2026, 7, 25), new Date(2026, 8, 25), [personal], [jar], 500000);
  const next = [personal, expense(200000, '2026-09-01')];
  const updated = syncBankTransactionSummaries([summary], [personal], next, 25, now)[0];
  assert.equal(updated.expense, 210000); assert.equal(updated.income, summary.income);
  assert.deepEqual(updated.jarBreakdown, summary.jarBreakdown); assert.deepEqual(updated.spendingByJar, summary.spendingByJar);
  assert.equal(updated.carriedForward, summary.carriedForward);
  assert.equal(syncBankTransactionSummaries([updated], next, next, 25, now)[0].expense, 210000);
});
test('backend allows owned-account expenses but rejects foreign accounts, jar mixing and invalid summary totals', () => {
  const base = { jars: [jar], bankAccounts: [account], transactions: [expense()] };
  const saved = validateAndNormalizeUserData(base); assert.ok(saved.value, saved.error);
  assert.equal(validateAndNormalizeUserData({ ...base, transactions: [{ ...expense(), jarId: jar.id }] }).error, undefined);
  for (const invalid of [expense(200000, undefined, 'foreign'), { ...expense(), jarId: 'foreign-jar' }, { ...expense(), allocations: [{ jarId: jar.id, amount: 200000 }] }, { ...expense(), type: 'transfer' }]) assert.ok(validateAndNormalizeUserData({ ...base, transactions: [invalid] }).error);
  assert.equal(validateAndNormalizeUserData({ ...base, transactions: [] }, base).error, undefined);
  const summary = createMonthlyCycleSummary(new Date(2026, 8, 25), new Date(2026, 9, 25), [expense()], [], 0);
  for (const unallocatedExpense of [-1, Infinity, 200001]) assert.ok(validateAndNormalizeUserData({ ...base, monthlySummaries: [{ ...summary, unallocatedExpense }] }).error);
  assert.equal(validateAndNormalizeUserData({ ...base, monthlySummaries: [summary] }).error, undefined);
});
test('bank-only expense categories are selectable and custom business categories do not require a jar', () => {
  assert.ok(getTransactionCategories('expense', undefined, []).length > 0);
  const category = { id: 'custom-business', type: 'expense', name: 'Business supplies', icon: 'tag', isCustom: true };
  const result = validateCustomCategories([category]); assert.ok(result.value, result.error);
  assert.ok(getTransactionCategories('expense', undefined, result.value!).some(c => c.id === category.id));
  assert.ok(getTransactionCategories('expense', 'NEC', result.value!).some(c => c.id === category.id));
  const normalized = validateAndNormalizeUserData({ jars: [], bankAccounts: [account], transactions: [expense()], customCategories: result.value });
  assert.ok(normalized.value, normalized.error);
  assert.ok(validateCustomCategories([{ ...category, jarCode: 'bad value!' }]).error);
});
