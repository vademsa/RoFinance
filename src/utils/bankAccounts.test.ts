import assert from 'node:assert/strict';
import test from 'node:test';
import type { BankAccount } from '../types';
import type { Jar } from '../types';
import {
  bankAccountKey,
  deduplicateBankAccounts,
  getDerivedBankBalance,
  syncBankAccountsWithJars,
} from './bankAccounts';

const createAccount = (
  id: string,
  bankCode: string,
  accountNumber: string,
  linkedJarCode: string,
): BankAccount => ({
  id,
  bankCode,
  bankName: bankCode,
  accountNumber,
  accountHolder: 'NGUYEN VAN A',
  balance: 0,
  lastSynced: 'Chưa cập nhật',
  status: 'connected',
  linkedJarCode,
});

test('keeps equal account numbers when they belong to different banks and jars', () => {
  const accounts = [
    createAccount('bank-safe', 'VCB', '123456789', 'SAFE'),
    createAccount('bank-nec', 'TCB', '123456789', 'NEC'),
  ];

  assert.equal(deduplicateBankAccounts(accounts).length, 2);
  assert.notEqual(bankAccountKey(accounts[0]), bankAccountKey(accounts[1]));
});

test('deduplicates the same bank and account number', () => {
  const accounts = [
    createAccount('bank-safe-old', 'VCB', '123456789', 'SAFE'),
    { ...createAccount('bank-safe-new', 'VCB', '123456789', 'SAFE'), balance: 500_000 },
  ];

  const result = deduplicateBankAccounts(accounts);
  assert.equal(result.length, 1);
  assert.equal(result[0].balance, 500_000);
});

const createJar = (
  id: string,
  code: string,
  bankCode: string,
  accountNumber: string,
  targetBudget: number,
  currentSpent: number,
): Jar => ({
  id,
  code,
  name: code,
  percentage: 50,
  bankCode,
  bankName: bankCode,
  accountNumber,
  accountName: 'NGUYEN VAN A',
  color: '#000000',
  description: '',
  targetBudget,
  currentSpent,
});

test('aggregates the remaining money of all jars sharing one bank account', () => {
  const jars = [
    createJar('jar-nec', 'NEC', 'TCB', '123456789', 5_000_000, 1_200_000),
    createJar('jar-play', 'PLAY', 'TCB', '123456789', 2_000_000, 300_000),
  ];
  const account = createAccount('bank-nec', 'TCB', '123456789', 'NEC');

  assert.equal(getDerivedBankBalance(jars, account), 5_500_000);
  const synced = syncBankAccountsWithJars(jars, [account]);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].balance, 5_500_000);
  assert.equal(synced[0].linkedJarCode, undefined);
});

test('income allocation and expense changes are reflected once through jar balances', () => {
  const account = createAccount('bank-nec', 'TCB', '123456789', 'NEC');
  const before = [createJar('jar-nec', 'NEC', 'TCB', '123456789', 3_000_000, 500_000)];
  const afterIncome = [{ ...before[0], targetBudget: 4_000_000 }];
  const afterExpense = [{ ...afterIncome[0], currentSpent: 800_000 }];

  assert.equal(getDerivedBankBalance(before, account), 2_500_000);
  assert.equal(getDerivedBankBalance(afterIncome, account), 3_500_000);
  assert.equal(getDerivedBankBalance(afterExpense, account), 3_200_000);
});

test('keeps a standalone manual account while syncing jar-linked accounts', () => {
  const manual = {
    ...createAccount('manual-vcb', 'VCB', '987654321', 'SAFE'),
    isManuallyAdded: true,
    balance: 700_000,
  };
  const jars = [createJar('jar-nec', 'NEC', 'TCB', '123456789', 2_000_000, 0)];

  const synced = syncBankAccountsWithJars(jars, [manual]);
  assert.equal(synced.length, 2);
  assert.equal(synced.find((account) => account.id === manual.id)?.balance, 700_000);
});

test('merges a manual duplicate with a linked account without losing its manual origin', () => {
  const manual = {
    ...createAccount('manual-tcb', 'TCB', '123456789', 'NEC'),
    isManuallyAdded: true,
    balance: 100_000,
  };
  const jars = [createJar('jar-nec', 'NEC', 'TCB', '123456789', 2_000_000, 400_000)];

  const synced = syncBankAccountsWithJars(jars, [manual]);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].balance, 1_600_000);
  assert.equal(synced[0].isManuallyAdded, true);
  assert.equal(syncBankAccountsWithJars([], synced).length, 1);
});
