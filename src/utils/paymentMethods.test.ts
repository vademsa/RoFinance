import assert from 'node:assert/strict';
import test from 'node:test';
import type { Jar, Transaction } from '../types';
import { migrateTransactionPaymentMethods } from './paymentMethods';
import { findBankByCode, findPaymentMethodByName } from '../../shared/banks';
import { canCreateVietQR, createVietQRPayload } from './vietqrPayload';

const jar = {
  id: 'jar-nec',
  code: 'NEC',
  name: 'Nhu cầu thiết yếu',
  percentage: 100,
  bankName: 'Techcombank',
  bankCode: 'TCB',
  accountNumber: '123456789',
  accountName: 'NGUYEN AN',
  color: '#000000',
  description: 'Thiết yếu',
  targetBudget: 1_000_000,
  currentSpent: 0,
} satisfies Jar;

const transaction = {
  id: 'tx-legacy',
  type: 'expense',
  amount: 50_000,
  jarId: jar.id,
  category: 'Ăn sáng',
  date: '2026-08-28',
  description: 'Bữa sáng',
  bankName: 'TECHCOMBANK',
} satisfies Transaction;

test('canonicalizes a known legacy bank alias during local import', () => {
  const result = migrateTransactionPaymentMethods([transaction], [jar]);
  assert.equal(result.changed, true);
  assert.equal(result.migratedItems[0].paymentMethodCode, 'TCB');
  assert.equal(result.migratedItems[0].bankName, 'Techcombank');
  assert.equal(result.migratedItems[0].legacyPaymentLabel, undefined);
});

test('maps an unknown legacy label to cash while preserving the old label', () => {
  const result = migrateTransactionPaymentMethods([
    { ...transaction, bankName: 'Ví công ty cũ' },
  ], [jar]);
  assert.equal(result.migratedItems[0].paymentMethodCode, 'CASH');
  assert.equal(result.migratedItems[0].bankName, 'Tiền mặt');
  assert.equal(result.migratedItems[0].legacyPaymentLabel, 'Ví công ty cũ');
});

test('supports Cake and UOB consistently for selection, legacy names and VietQR', () => {
  assert.equal(findBankByCode('cake')?.shortName, 'Cake by VPBank');
  assert.equal(findBankByCode('uob')?.shortName, 'UOB Việt Nam');
  assert.equal(findPaymentMethodByName('Cake by VPBank')?.code, 'CAKE');
  assert.equal(findPaymentMethodByName('UOB Việt Nam')?.code, 'UOB');
  assert.equal(canCreateVietQR('CAKE', '123456789'), true);
  assert.equal(canCreateVietQR('UOB', '987654321'), true);
  assert.match(createVietQRPayload({ bankCode: 'CAKE', accountNumber: '123456789' }), /^000201/);
  assert.match(createVietQRPayload({ bankCode: 'UOB', accountNumber: '987654321' }), /^000201/);
});
