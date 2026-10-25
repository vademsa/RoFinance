import assert from 'node:assert/strict';
import test from 'node:test';
import type { BankAccount, Jar, Transaction } from '../../src/types';
import { getAccountTransactionNet, getBankOpeningBalance, syncBankAccountsWithJars } from '../../src/utils/bankAccounts';
import { applyCurrentCycleSpending } from '../../src/utils/monthlyCycle';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import { assessFinance, assessSummary } from '../../shared/character';
import { createMonthlyCycleSummary } from '../../src/utils/monthlyCycle';

const jar: Jar = { id: 'personal', code: 'NEC', name: 'Personal limit', percentage: 100, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST', color: '#6366f1', description: '', targetBudget: 2000000, cycleAllocation: 2000000, currentSpent: 0, carryovers: [], transferredIn: [] };
const account: BankAccount = { id: 'actual-bank', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 9000000, openingBalance: 9000000, balanceReconciled: true, status: 'connected', lastSynced: '' };
const tx: Transaction = { id: 'personal-payment', type: 'expense', amount: 200000, jarId: jar.id, bankAccountId: account.id, date: '2026-10-21', category: 'Ăn sáng', description: 'Personal purchase', paymentMethodCode: 'TCB', bankName: 'Techcombank' };
test('changing limits, allocation, spending metadata or removing jars never changes real bank money', () => {
  const states = [[jar], [{ ...jar, targetBudget: 99999999, cycleAllocation: 99999999 }], [{ ...jar, currentSpent: 1500000 }], []];
  for (const jars of states) assert.equal(syncBankAccountsWithJars(jars, [account], [])[0].balance, 9000000);
  assert.equal(syncBankAccountsWithJars([], [account], [])[0].id, account.id);
});
test('personal expense records actual bank debit and budget spending independently', () => {
  const jars = applyCurrentCycleSpending([jar], [tx], 25, new Date(2026, 9, 21));
  assert.equal(jars[0].currentSpent, 200000); assert.equal(jars[0].targetBudget, 2000000);
  const banks = syncBankAccountsWithJars(jars, [account], [tx]);
  assert.equal(banks[0].balance, 8800000);
  assert.equal(syncBankAccountsWithJars([{ ...jars[0], targetBudget: 100000000 }], banks, [tx])[0].balance, 8800000);
});
test('business cash flow changes account only and personal/business switching does not double debit', () => {
  const business = { ...tx, jarId: '' };
  assert.equal(applyCurrentCycleSpending([jar], [business], 25, new Date(2026, 9, 21))[0].currentSpent, 0);
  const saved = syncBankAccountsWithJars([jar], [account], [business]);
  assert.equal(saved[0].balance, 8800000);
  assert.equal(syncBankAccountsWithJars([jar], saved, [tx])[0].balance, 8800000);
  assert.equal(syncBankAccountsWithJars([jar], saved, [])[0].balance, 9000000);
  assert.equal(getAccountTransactionNet([{ ...tx, type: 'income', amount: 500000 }, business], account.id), 300000);
});
test('migration preserves old saved balance and flags jar-derived figures, without fabricating cash or replaying history', () => {
  const { openingBalance: _opening, balanceReconciled: _confirmed, ...legacy } = account;
  const snapshot = structuredClone(legacy);
  const migrated = syncBankAccountsWithJars([jar], [legacy], [tx]);
  assert.equal(migrated[0].balance, legacy.balance);
  assert.equal(migrated[0].openingBalance, legacy.balance + tx.amount);
  assert.equal(migrated[0].balanceReconciled, false);
  assert.deepEqual(legacy, snapshot);
  assert.deepEqual(syncBankAccountsWithJars([jar], JSON.parse(JSON.stringify(migrated)), [tx]), migrated);
  const additional = { ...tx, id: 'new-after-migration' };
  assert.equal(syncBankAccountsWithJars([jar], migrated, [tx, additional])[0].balance, 8800000);
});
test('confirming actual balance recalibrates only the account, including existing personal transactions', () => {
  const openingBalance = getBankOpeningBalance([jar], account, [tx], 5000000);
  assert.equal(openingBalance, 5200000);
  assert.equal(syncBankAccountsWithJars([jar], [{ ...account, openingBalance }], [tx])[0].balance, 5000000);
});
test('API validates both account ownership and jar ownership when a personal transaction uses both', () => {
  const base = { jars: [jar], bankAccounts: [account], transactions: [tx] };
  const result = validateAndNormalizeUserData(base); assert.ok(result.value, result.error);
  for (const input of [{ ...tx, bankAccountId: 'foreign-bank' }, { ...tx, jarId: 'foreign-jar' }, { ...tx, type: 'transfer' }, { ...tx, paymentMethodCode: 'FORGED' }]) assert.ok(validateAndNormalizeUserData({ ...base, transactions: [input] }).error);
  for (const input of [{ ...account, openingBalance: Infinity }, { ...account, openingBalance: '9000' }, { ...account, balanceReconciled: 'true' }]) assert.ok(validateAndNormalizeUserData({ ...base, bankAccounts: [input] }).error);
  const income = { ...tx, type: 'income', allocations: [{ jarId: jar.id, amount: tx.amount }] };
  assert.equal(validateAndNormalizeUserData({ ...base, transactions: [income] }).error, undefined);
  assert.ok(validateAndNormalizeUserData({ ...base, transactions: [{ ...income, allocations: [{ jarId: jar.id, amount: 1 }] }] }).error);
});

test('API recomputes balances from actual ledger and refuses an old client dropping the baseline', () => {
  const existing = { jars: [jar], bankAccounts: [account], transactions: [] };
  const normalized = validateAndNormalizeUserData({ ...existing, bankAccounts: [{ ...account, balance: 123 }], transactions: [tx] }, existing);
  assert.ok(normalized.value, normalized.error);
  assert.equal((normalized.value!.bankAccounts as BankAccount[])[0].balance, 8800000);
  const { openingBalance: _opening, ...oldClient } = account;
  assert.ok(validateAndNormalizeUserData({ ...existing, bankAccounts: [oldClient] }, existing).error);
  const legacyExisting = { ...existing, bankAccounts: [{ ...oldClient, balance: 6000000 }] };
  const migrated = validateAndNormalizeUserData({ ...legacyExisting, bankAccounts: [{ ...oldClient, balance: 99999999 }], transactions: [tx] }, legacyExisting);
  assert.ok(migrated.value, migrated.error);
  assert.equal((migrated.value!.bankAccounts as BankAccount[])[0].balance, 5800000);
});

test('outside-jar business flow does not change personal-budget character assessment', () => {
  const finance = { jars: [jar], transactions: [tx], monthlyIncome: 2000000, activeCycleStart: '2026-09-25', preferences: { monthlyResetDay: 25 } };
  const business = { ...tx, id: 'business', jarId: '', amount: 100000000 };
  assert.deepEqual(assessFinance({ ...finance, transactions: [tx, business] }, '2026-10-21'), assessFinance(finance, '2026-10-21'));
  const summary = createMonthlyCycleSummary(new Date(2026, 8, 25), new Date(2026, 9, 25), [tx], [jar], 2000000);
  const withBusiness = createMonthlyCycleSummary(new Date(2026, 8, 25), new Date(2026, 9, 25), [tx, business, { ...business, id: 'business-income', type: 'income' }], [jar], 2000000);
  assert.deepEqual(assessSummary(withBusiness, '2026-10-25'), assessSummary(summary, '2026-10-25'));
});
