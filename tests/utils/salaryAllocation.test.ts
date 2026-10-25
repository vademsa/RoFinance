import assert from 'node:assert/strict';
import test from 'node:test';
import type { BankAccount, Jar, Transaction } from '../../src/types';
import { allocateSalary } from '../../src/utils/salaryAllocation';
import { getAccountTransactionNet, syncBankAccountsWithJars } from '../../src/utils/bankAccounts';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import { buildAnalyticsCycles } from '../../src/utils/analytics';
import { createMonthlyCycleSummary, applyCurrentCycleSpending } from '../../src/utils/monthlyCycle';
import { migrateTransactionPaymentMethods } from '../../src/utils/paymentMethods';

const now = new Date(2026, 9, 26);
const source: BankAccount = { id: 'salary-bank', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'SYNTHETIC', balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true };
const other: BankAccount = { ...source, id: 'spending-bank', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', balance: 2000000, openingBalance: 2000000 };
const jar: Jar = { id: 'essentials', code: 'NEC', name: 'Essentials', percentage: 40, bankCode: other.bankCode, bankName: other.bankName, accountNumber: other.accountNumber, accountName: 'SYNTHETIC', color: '#6366f1', description: '', targetBudget: 100000, cycleAllocation: 0, currentSpent: 0, carryovers: [{ sourceCycleStart: '2026-09-25', sourceCycleEnd: '2026-10-24', amount: 100000 }] };
const jars = [jar, { ...jar, id: 'education', code: 'EDU', percentage: 30 },
  { ...jar, id: 'safety', code: 'SAFE', percentage: 30, bankCode: '', bankName: '', accountNumber: '' }];
const receipt = { bankAccountId: source.id, date: '2026-10-26' };
const run = (overrides: Partial<Parameters<typeof allocateSalary>[0]> = {}) => allocateSalary({ income: 10000000, jars, accounts: [source, other], transactions: [], receipt, resetDay: 25, now, ...overrides });

test('salary is received once and shared accounts combine jars; unlinked money stays in salary account', () => {
  const before = structuredClone(jars);
  const result = run();
  assert.equal(result.transactions.filter(t => t.type === 'income').length, 1);
  const transfer = result.transactions.find(t => t.type === 'transfer')!;
  assert.equal(transfer.amount, 7000000);
  assert.equal(transfer.bankAccountId, source.id); assert.equal(transfer.transferToBankAccountId, other.id);
  assert.equal(result.bankAccounts.find(a => a.id === source.id)!.balance, 4000000);
  assert.equal(result.bankAccounts.find(a => a.id === other.id)!.balance, 9000000);
  assert.equal(result.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 13000000);
  assert.deepEqual(jars, before);
  assert.deepEqual(applyCurrentCycleSpending(jars, result.transactions, 25, now), applyCurrentCycleSpending(jars, [], 25, now));
});

test('one account for all jars gets the full salary without a self-transfer', () => {
  const result = run({ jars: jars.map(j => ({ ...j, bankCode: source.bankCode, bankName: source.bankName, accountNumber: source.accountNumber })), accounts: [source] });
  assert.equal(result.transactions.length, 1);
  assert.equal(result.bankAccounts[0].balance, 11000000);
});

test('repeated save/reload replaces the salary batch; changing income/percentages does not accumulate salary', () => {
  const first = run();
  const again = run({ accounts: JSON.parse(JSON.stringify(first.bankAccounts)), transactions: JSON.parse(JSON.stringify(first.transactions)) });
  assert.deepEqual(again, first);
  const changed = run({ accounts: again.bankAccounts, transactions: again.transactions, income: 5000000,
    jars: jars.map((j, i) => ({ ...j, percentage: i === 0 ? 100 : 0 })) });
  assert.equal(changed.transactions.length, 2);
  assert.equal(changed.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 8000000);
  assert.equal(changed.transactions.find(t => t.type === 'transfer')!.amount, 5000000);
});

test('allocation rounds whole VND exactly, even with tiny salaries and several shared jars', () => {
  for (const income of [1, 2, 11, 7998545, 1000000000000]) {
    const result = run({ income });
    assert.equal(result.allocations.reduce((sum, a) => sum + a.amount, 0), income);
    assert.equal(result.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 3000000 + income);
  }
});

test('legacy account migration freezes the old baseline before adding salary', () => {
  const { openingBalance: _, ...legacy } = source;
  const result = run({ accounts: [legacy, other] });
  assert.equal(result.bankAccounts.find(a => a.id === source.id)!.openingBalance, source.balance);
  assert.equal(result.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 13000000);
});

test('old-cycle salary, business flow and pre-existing personal receipts are preserved byte-for-byte', () => {
  const older = run({ now: new Date(2026, 8, 26), receipt: { ...receipt, date: '2026-09-26' } });
  const business: Transaction = { id: 'business-income', type: 'income', bankAccountId: source.id, jarId: '', amount: 12345, date: '2026-10-26', category: 'Business', description: 'Synthetic business receipt', paymentMethodCode: 'TCB', bankName: source.bankName };
  const original = [...older.transactions, business];
  const result = run({ accounts: syncBankAccountsWithJars(jars, older.bankAccounts, original), transactions: original });
  assert.deepEqual(result.transactions.slice(0, original.length), original);
  assert.equal(getAccountTransactionNet(result.transactions, source.id) + getAccountTransactionNet(result.transactions, other.id), 20012345);
});

test('reject invalid account, income, percentage, dates and reversal of money already spent', () => {
  for (const input of [{ income: -1 }, { income: 0 }, { income: 1.5 }, { income: NaN },
    { receipt: { ...receipt, bankAccountId: 'foreign-bank' } },
    { receipt: { ...receipt, date: '2026-09-26' } }, { receipt: { ...receipt, date: '2026-10-27' } },
    { receipt: { ...receipt, date: '2026-02-30' } }, { jars: [{ ...jar, percentage: 90 }] }]) assert.throws(() => run(input));
  const first = run();
  const spent: Transaction = { id: 'spent', type: 'expense', bankAccountId: other.id, jarId: '', amount: 8500000, date: receipt.date, category: 'Business', description: 'Synthetic spend' };
  assert.throws(() => run({ income: 100, accounts: first.bankAccounts, transactions: [...first.transactions, spent] }), /Không đủ số dư/);
});

test('API recomputes both sides, preserves IDs/metadata across reload, and rejects forged account/transfer groups', () => {
  const result = run();
  const data = { jars, bankAccounts: result.bankAccounts, transactions: result.transactions };
  const normalized = validateAndNormalizeUserData(data);
  assert.ok(normalized.value, normalized.error);
  assert.deepEqual((normalized.value!.bankAccounts as BankAccount[]).map(a => a.balance), result.bankAccounts.map(a => a.balance));
  assert.deepEqual(validateAndNormalizeUserData(normalized.value!, normalized.value!).value, normalized.value);
  const transfer = result.transactions.find(t => t.type === 'transfer')!;
  for (const patch of [{ transferToBankAccountId: 'foreign-bank' }, { bankAccountId: 'foreign-bank' },
    { transferToBankAccountId: source.id }, { amount: 10000001 }, { allocations: [] },
    { date: '2026-10-25' }, { salaryCycleStart: undefined }]) {
    assert.ok(validateAndNormalizeUserData({ ...data, transactions: result.transactions.map(t => t.id === transfer.id ? { ...t, ...patch } : t) }).error);
  }
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [transfer] }).error);
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [...result.transactions, { ...transfer, id: 'duplicate-destination' }] }).error);
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [...result.transactions, { ...result.transactions[0], id: 'duplicate-salary' }] }).error);
  assert.deepEqual(migrateTransactionPaymentMethods(result.transactions, jars).migratedItems, result.transactions);
});

test('API rejects salary reversal that would overdraw a destination, even if client checks are bypassed', () => {
  const result = run();
  const spend: Transaction = { id: 'business-spend', type: 'expense', jarId: '', bankAccountId: other.id,
    amount: 8500000, category: 'Business', date: receipt.date, description: 'Synthetic spend', paymentMethodCode: 'VCB', bankName: other.bankName };
  const existing = { jars, bankAccounts: result.bankAccounts, transactions: [...result.transactions, spend] };
  const lower = run({ income: 100 });
  const forged = { ...existing, bankAccounts: lower.bankAccounts, transactions: [...lower.transactions, spend] };
  assert.match(validateAndNormalizeUserData(forged, existing).error || '', /Không đủ số dư/);
});

test('switching jar templates can redistribute the same salary without rewriting the archived receipt', () => {
  const first = run();
  const newJars = jars.map(j => ({ ...j, id: `new-${j.id}`, bankCode: source.bankCode, bankName: source.bankName, accountNumber: source.accountNumber }));
  const result = run({ jars: newJars, accounts: first.bankAccounts, transactions: first.transactions });
  assert.deepEqual(result.transactions.find(t => t.type === 'income'), first.transactions.find(t => t.type === 'income'));
  const existing = { jars, bankAccounts: first.bankAccounts, transactions: first.transactions };
  const normalized = validateAndNormalizeUserData({ jars: newJars, archivedJars: jars, bankAccounts: result.bankAccounts, transactions: result.transactions }, existing);
  assert.ok(normalized.value, normalized.error);
  assert.equal(result.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 13000000);
});

test('internal transfers do not inflate analytics, expense, carryover or net income', () => {
  const result = run();
  const cycle = buildAnalyticsCycles({ jars, jarRegistry: jars, transactions: result.transactions, summaries: [], monthlyIncome: 10000000, resetDay: 25, now })[0];
  assert.equal(cycle.income, 10000000); assert.equal(cycle.expense, 0); assert.equal(cycle.net, 10000000);
  const summary = createMonthlyCycleSummary(new Date(2026, 9, 25), new Date(2026, 10, 25), result.transactions, jars, 10000000);
  assert.equal(summary.income, 10000000); assert.equal(summary.expense, 0); assert.equal(summary.carriedForward, 300000);
});

test('untracked salary source creates direct grouped receipts without any source debit or internal transfer', () => {
  const result = run({ receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: source.id } });
  assert.equal(result.transactions.length, 2);
  assert.ok(result.transactions.every(t => t.type === 'income' && t.salarySource === 'external'));
  assert.equal(result.transactions.reduce((sum, t) => sum + t.amount, 0), 10000000);
  assert.equal(result.transactions.find(t => t.bankAccountId === other.id)!.amount, 7000000);
  assert.equal(result.transactions.find(t => t.bankAccountId === source.id)!.amount, 3000000);
  assert.equal(result.bankAccounts.find(a => a.id === source.id)!.balance, 4000000);
  assert.equal(result.bankAccounts.find(a => a.id === other.id)!.balance, 9000000);
  assert.equal(result.bankAccounts.length, 2);
  const validated = validateAndNormalizeUserData({ jars, bankAccounts: result.bankAccounts, transactions: result.transactions });
  assert.ok(validated.value, validated.error);
  const cycle = buildAnalyticsCycles({ jars, jarRegistry: jars, transactions: result.transactions, summaries: [], monthlyIncome: 10000000, resetDay: 25, now })[0];
  assert.equal(cycle.income, 10000000); assert.equal(cycle.expense, 0);
  const again = run({ receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: source.id }, accounts: result.bankAccounts, transactions: result.transactions });
  assert.deepEqual(again, result);
});

test('untracked salary source combines all jars at one bank and requires a real destination for unlinked money', () => {
  const linkedJars = jars.map(j => ({ ...j, bankCode: other.bankCode, bankName: other.bankName, accountNumber: other.accountNumber }));
  const result = run({ jars: linkedJars, receipt: { ...receipt, bankAccountId: null } });
  assert.equal(result.transactions.length, 1); assert.equal(result.transactions[0].amount, 10000000);
  assert.equal(result.bankAccounts.find(a => a.id === source.id)!.balance, source.balance);
  assert.equal(result.bankAccounts.find(a => a.id === other.id)!.balance, other.balance + 10000000);
  assert.throws(() => run({ receipt: { ...receipt, bankAccountId: null } }), /Hũ chưa liên kết/);
  assert.throws(() => run({ receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: 'foreign-bank' } }), /không hợp lệ/);
});

test('switching between saved-source and direct-receipt modes never receives the same salary twice', () => {
  const first = run();
  const direct = run({ receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: source.id }, accounts: first.bankAccounts, transactions: first.transactions });
  assert.ok(direct.transactions.every(t => t.type === 'income'));
  const saved = run({ accounts: direct.bankAccounts, transactions: direct.transactions });
  assert.equal(saved.transactions.filter(t => t.type === 'income').length, 1);
  assert.equal(saved.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 13000000);
  assert.deepEqual(saved.bankAccounts, first.bankAccounts);
  // Reordering or introducing a new destination must not reuse another receipt's ID.
  const rearranged = run({ jars: [jars[2], jars[0], jars[1]], accounts: direct.bankAccounts, transactions: direct.transactions,
    receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: source.id } });
  assert.equal(new Set(rearranged.transactions.map(t => t.id)).size, rearranged.transactions.length);
  assert.equal(rearranged.bankAccounts.reduce((sum, a) => sum + a.balance, 0), 13000000);
});

test('API rejects foreign destinations, mixed salary modes, invalid mode values and duplicated direct allocations', () => {
  const result = run({ receipt: { ...receipt, bankAccountId: null, unlinkedBankAccountId: source.id } });
  const data = { jars, bankAccounts: result.bankAccounts, transactions: result.transactions };
  for (const patch of [{ bankAccountId: 'foreign-bank' }, { salarySource: 'anything' },
    { salarySource: undefined }, { date: '2026-10-25' }, { salaryCycleStart: undefined }]) {
    assert.ok(validateAndNormalizeUserData({ ...data, transactions: result.transactions.map((t, i) => i === 0 ? { ...t, ...patch } : t) }).error);
  }
  const transfer = run().transactions.find(t => t.type === 'transfer')!;
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [...result.transactions, transfer] }).error);
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [...result.transactions, { ...result.transactions[0], id: 'duplicate-direct' }] }).error);
  const duplicateJar = { ...result.transactions[1], allocations: [{ jarId: result.transactions[0].jarId, amount: result.transactions[1].amount }] };
  assert.ok(validateAndNormalizeUserData({ ...data, transactions: [result.transactions[0], duplicateJar] }).error);
  const existing = { jars, bankAccounts: run().bankAccounts, transactions: run().transactions };
  assert.equal(validateAndNormalizeUserData(data, existing).error, undefined);
});
