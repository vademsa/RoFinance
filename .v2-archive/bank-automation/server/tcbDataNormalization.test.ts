import assert from 'node:assert/strict';
import { normalizeTCBUserData } from './tcbDataNormalization';

const normalized = normalizeTCBUserData({
  jars: [
    { id: 'jar-nec', code: 'NEC', bankCode: 'TCB', accountNumber: '4523088888' },
    { id: 'jar-edu', code: 'EDU', bankCode: 'VCB', accountNumber: '1018754212' },
    { id: 'jar-debt', code: 'DEBT', bankCode: 'VCB', accountNumber: '1018754212' },
  ],
  bankAccounts: [
    { id: 'legacy', bankCode: 'TECHCOMBANK', bankName: 'Techcombank', accountNumber: '4523 088 888', balance: 0, lastSynced: 'Chưa cập nhật' },
    { id: 'current', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '4523088888', balance: 900, lastSynced: '31/07/2026' },
    { id: 'vcb', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '1018754212', balance: 100, lastSynced: '31/07/2026', linkedJarCode: 'EDU' },
  ],
  transactions: [
    { id: 'auto-1', isAutoImported: true, bankName: 'Techcombank', type: 'expense', jarId: 'jar-debt' },
    { id: 'auto-in', isAutoImported: true, bankName: 'Techcombank', type: 'transfer', jarId: '', transferToJarId: 'jar-nec', sourceAccountNumber: '1018754212', recipientAccount: '4523088888', description: 'MBVCB NGUYEN QUANG TRUONG chuyen tien.CT tu 1018754212 toi 4523088888' },
    { id: 'auto-out', isAutoImported: true, bankName: 'Techcombank', type: 'transfer', jarId: 'jar-nec', sourceAccountNumber: '4523088888', recipientAccount: '1018754212', destinationBankCode: 'NGAN HANG TMCP NGOAI THUONG VIET NAM (VIETCOMBANK)' },
    { id: 'manual', type: 'expense', bankName: 'Techcombank', jarId: 'jar-debt' },
  ],
});

assert.equal(normalized.bankAccounts.length, 2, 'same normalized account number must be unique');
assert.equal(normalized.bankAccounts[0].bankCode, 'TCB');
assert.equal(normalized.bankAccounts[0].linkedJarCode, 'NEC');
assert.equal(normalized.transactions[0].jarId, 'jar-nec');
assert.equal(normalized.transactions[1].jarId, 'jar-edu');
assert.equal(normalized.transactions[1].transferToJarId, 'jar-nec');
assert.equal(normalized.transactions[1].sourceBankCode, 'VCB');
assert.equal(normalized.transactions[1].destinationBankCode, 'TCB');
assert.equal(normalized.transactions[2].jarId, 'jar-nec');
assert.equal(normalized.transactions[2].transferToJarId, 'jar-edu');
assert.equal(normalized.transactions[2].sourceBankCode, 'TCB');
assert.equal(normalized.transactions[2].destinationBankCode, 'VCB');
assert.equal(normalized.transactions[3].jarId, 'jar-debt', 'manual transaction must not be rewritten');

console.log('TCB data normalization: all assertions passed');
