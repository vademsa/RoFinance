import assert from 'node:assert/strict';
import test from 'node:test';
import type { BankAccount, Jar, Transaction } from '../types';
import { getBankAccountBalance, syncBankAccountsWithJars, editBankAccountDetails } from './bankAccounts';
import { syncBankIncomeSummaries } from './bankIncome';
import { buildAnalyticsCycles } from './analytics';
import { createMonthlyCycleSummary, rebuildMonthlyCycleSummaries } from './monthlyCycle';
import { buildExportReportData } from './exporter';

const now = new Date(2026, 9, 13, 12);
const account: BankAccount = { id: 'bank-1', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 300, status: 'connected', lastSynced: '', isManuallyAdded: true };
const jar: Jar = { id: 'jar-1', code: 'NEC', name: 'NEC', percentage: 100, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST', color: '#000000', description: '', targetBudget: 1000, currentSpent: 100, cycleAllocation: 1000, carryovers: [] };
const receipt = (id: string, amount: number, date = '2026-10-13', bankAccountId = account.id): Transaction => ({ id, type: 'income', amount, date, jarId: '', bankAccountId, category: 'Thu nhập khác', description: 'Bank receipt' });

test('linked bank receipts are added once and never change the jars, even after reload and spending', () => {
  const transactions = [receipt('tx-1', 200)];
  const before = structuredClone(jar);
  let saved = syncBankAccountsWithJars([jar], [account], transactions);
  assert.equal(saved[0].balance, 1100);
  assert.deepEqual(jar, before);
  saved = syncBankAccountsWithJars([jar], JSON.parse(JSON.stringify(saved)), transactions);
  assert.equal(saved[0].balance, 1100);
  assert.equal(syncBankAccountsWithJars([{ ...jar, currentSpent: 200 }], saved, transactions)[0].balance, 1000);
  assert.equal(syncBankAccountsWithJars([jar], saved, [receipt('tx-1', 350)])[0].balance, 1250);
  assert.equal(syncBankAccountsWithJars([jar], saved, [])[0].balance, 900);
  assert.equal(getBankAccountBalance([{ ...jar, currentSpent: 1100 }], saved[0], transactions), 100);
  const autoAccount = { ...saved[0], isManuallyAdded: false };
  assert.equal(syncBankAccountsWithJars([], [autoAccount], transactions)[0].balance, 200);
});

test('standalone receipt balances preserve their manual baseline, edits, deletion, bank selection and reconciliation', () => {
  const transactions = [receipt('tx-1', 200)];
  let saved = syncBankAccountsWithJars([], [account], transactions);
  assert.equal(saved[0].balance, 500);
  saved = syncBankAccountsWithJars([], JSON.parse(JSON.stringify(saved)), transactions);
  assert.equal(saved[0].balance, 500);
  assert.equal(syncBankAccountsWithJars([], saved, [receipt('tx-1', 350)])[0].balance, 650);
  assert.equal(syncBankAccountsWithJars([], saved, [])[0].balance, 300);
  assert.equal(syncBankAccountsWithJars([], saved, [receipt('tx-1', 200, undefined, 'bank-other')])[0].balance, 300);
  assert.equal(syncBankAccountsWithJars([], [{ ...saved[0], balance: 100, unallocatedOpeningBalance: -100 }], transactions)[0].balance, 100);
  const edited = editBankAccountDetails([], saved, account.id, { bankCode: 'VCB', accountNumber: '987654321', accountHolder: 'TEST' }, transactions);
  assert.equal(edited.bankAccounts[0].balance, 500);
  assert.equal(edited.bankAccounts[0].id, account.id);
});

test('cycle summaries include bank receipts exactly once without modifying jar budgets', () => {
  const transactions = [receipt('tx-1', 200)];
  const summary = createMonthlyCycleSummary(new Date(2026, 8, 25), new Date(2026, 9, 25), transactions, [jar], 1000);
  assert.equal(summary.income, 1200);
  assert.equal(summary.unallocatedIncome, 200);
  assert.equal(summary.jarBreakdown![0].cycleAllocation, 1000);
  assert.equal(rebuildMonthlyCycleSummaries([summary], transactions, [jar], 1000)[0].income, 1200);
  const current = buildAnalyticsCycles({ jars: [jar], jarRegistry: [jar], transactions, summaries: [], monthlyIncome: 1000, resetDay: 25, now }).find((cycle) => cycle.isCurrent)!;
  assert.equal(current.income, 1200); assert.equal(current.budget, 1000);
  assert.equal(buildExportReportData([jar], transactions, 1000, [jar], current).income, 1200);
  assert.equal(buildExportReportData([jar], transactions, 1000, [jar]).income, 1200);
});

test('backdated bank income needs no jar snapshot and can move cycles, change amounts and be deleted', () => {
  const previous = [receipt('tx-1', 200, '2026-09-01')];
  let summaries = syncBankIncomeSummaries([], [], previous, 25, now);
  assert.equal(summaries[0].cycleStart, '2026-08-25');
  assert.equal(summaries[0].income, 200); assert.equal(summaries[0].transactionCount, 1);
  assert.deepEqual(summaries[0].jarBreakdown, []);
  const next = [receipt('tx-1', 350, '2026-09-26')];
  summaries = syncBankIncomeSummaries(summaries, previous, next, 25, now);
  assert.equal(summaries[0].income, 0); assert.equal(summaries[0].transactionCount, 0);
  summaries = syncBankIncomeSummaries(summaries, next, [], 25, now);
  assert.equal(summaries[0].income, 0);
  assert.equal(getBankAccountBalance([], { ...account, unallocatedOpeningBalance: 300 }, previous), 500);
});
