import assert from 'node:assert/strict';
import { buildTCBOwnership, classifyTCBTransaction, inferBankCodeFromTCBDetails } from './tcbClassifier';

const jars = [
  { id: 'jar-nec', code: 'NEC', accountNumber: '4523 088 888', accountName: 'NGUYỄN QUANG TRƯỜNG' },
  { id: 'jar-ffa', code: 'FFA', accountNumber: '1018754212', accountName: 'NGUYEN QUANG TRUONG' },
  { id: 'jar-debt', code: 'DEBT', accountNumber: '19771641753014', accountName: 'NGUYEN QUANG TRUONG' },
];
const ownership = buildTCBOwnership(jars, [
  { accountNumber: '999000', accountHolder: 'NGUYEN QUANG TRUONG' },
]);
const base = {
  state: 'COMPLETED',
  transactionAmountCurrency: { amount: '100000', currencyCode: 'VND' },
};

const classify = (item: any) => classifyTCBTransaction({ ...base, ...item }, ownership);

assert.equal(classify({
  creditDebitIndicator: 'DBIT',
  description: 'NGUYEN QUANG TRUONG chuyen tien',
  counterPartyName: 'NGUYEN VAN TUAN',
  counterPartyAccountNumber: '0986201992',
  additions: { debitAcctNo: '4523088888', debitAcctName: 'NGUYEN QUANG TRUONG', creditAcctName: 'NGUYEN VAN TUAN' },
}).transactionType, 'expense', 'DBIT to another person must be expense');

const ownDebit = classify({
  creditDebitIndicator: 'DBIT',
  counterPartyName: 'NGUYEN QUANG TRUONG',
  counterPartyAccountNumber: '1018754212',
  additions: { debitAcctNo: '4523088888', creditAcctNo: '1018754212', creditAcctName: 'NGUYEN QUANG TRUONG' },
});
assert.equal(ownDebit.transactionType, 'transfer');
assert.equal(ownDebit.sourceJar?.id, 'jar-nec');
assert.equal(ownDebit.counterpartyJar?.id, 'jar-ffa');

const incomingOwnTransfer = classify({
  creditDebitIndicator: 'CRDT',
  description: 'CT tu 1018754212 NGUYEN QUANG TRUONG toi 4523088888',
  additions: { creditAcctNo: '4523088888', creditAcctName: 'NGUYEN QUANG TRUONG', accountDebitName: 'VND-BNK-CK247 NH KHAC – TK TCB' },
});
assert.equal(incomingOwnTransfer.transactionType, 'transfer', 'CRDT from owner name in details must be transfer');
assert.equal(incomingOwnTransfer.counterpartyAccount, '1018754212', 'source account must be parsed from transfer details');
assert.equal(incomingOwnTransfer.counterpartyJar?.id, 'jar-ffa');

const mbvcbMessage = 'MBVCB.15271102180.6205BFTVG25NL9S4. NGUYEN QUANG TRUONG chuyen tien.CT tu 1018754212 NGUYEN QUANG TRUONG toi 4523088888 NGUYEN QUANG TRUONG tai TECHCOMBANK';
const mbvcbTransfer = classify({
  creditDebitIndicator: 'CRDT',
  description: mbvcbMessage,
  additions: {
    creditAcctNo: '4523088888',
    creditAcctName: 'NGUYEN QUANG TRUONG',
    accountDebitName: 'VND-BNK-CK247 NH KHAC – TK TCB',
  },
});
assert.equal(inferBankCodeFromTCBDetails(mbvcbMessage), 'VCB');
assert.equal(mbvcbTransfer.transactionType, 'transfer');
assert.equal(mbvcbTransfer.counterpartyAccount, '1018754212');
assert.equal(mbvcbTransfer.counterpartyJar?.id, 'jar-ffa');

assert.equal(classify({
  creditDebitIndicator: 'CRDT',
  description: 'NGUYEN QUANG TRUONG hoan tien',
  counterPartyName: 'NGUYEN VAN TUAN',
  additions: { creditAcctNo: '4523088888', creditAcctName: 'NGUYEN QUANG TRUONG' },
}).transactionType, 'income', 'structured external sender must override description fallback');

assert.equal(classify({
  creditDebitIndicator: 'DBIT',
  description: 'NGUYEN QUANG TRUONG chuyen tien',
  counterPartyName: 'CUA HANG ABC',
  additions: { debitAcctNo: '4523088888', creditAcctName: 'CUA HANG ABC' },
}).transactionType, 'expense', 'sender name in DBIT description must not make it internal');

assert.equal(classify({
  creditDebitIndicator: 'DBIT',
  counterPartyName: 'NGUYEN QUANG TRUONG',
  counterPartyAccountNumber: '19771641753014',
  additions: { debitAcctNo: '4523088888', creditAcctNo: '19771641753014', creditAcctName: 'NGUYEN QUANG TRUONG' },
}).transactionType, 'transfer', 'credit-card payment between owned accounts must be transfer');

const ambiguousOwnership = buildTCBOwnership([
  ...jars,
  { id: 'jar-play', code: 'PLAY', accountNumber: '4523088888', accountName: 'NGUYEN QUANG TRUONG' },
], []);
assert.equal(classifyTCBTransaction({
  ...base,
  creditDebitIndicator: 'DBIT',
  counterPartyName: 'CUA HANG ABC',
  additions: { debitAcctNo: '4523088888', creditAcctName: 'CUA HANG ABC' },
}, ambiguousOwnership).sourceJar, undefined, 'duplicate jar mapping must stay unassigned');

const tcbNecOwnership = buildTCBOwnership([
  { ...jars[0], bankCode: 'TCB' },
  { id: 'jar-play', code: 'PLAY', bankCode: 'TCB', accountNumber: '4523088888', accountName: 'NGUYEN QUANG TRUONG' },
], []);
assert.equal(classifyTCBTransaction({
  ...base,
  creditDebitIndicator: 'DBIT',
  counterPartyName: 'CUA HANG ABC',
  additions: { debitAcctNo: '4523088888', creditAcctName: 'CUA HANG ABC' },
}, tcbNecOwnership).sourceJar?.id, 'jar-nec', 'duplicate TCB account must explicitly prefer NEC');

assert.equal(classify({
  creditDebitIndicator: 'DBIT',
  counterPartyName: 'NGUYEN QUANG TRUONG',
  additions: { debitAcctNo: '999000', creditAcctName: 'NGUYEN QUANG TRUONG' },
}).transactionType, 'transfer', 'bank account outside jars must still be recognized as owned');

console.log('TCB classifier: all assertions passed');
