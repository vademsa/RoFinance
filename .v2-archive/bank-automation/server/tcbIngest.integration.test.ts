import assert from 'node:assert/strict';
import { pool } from './db';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:6868';
const email = `tcb-integration-${Date.now()}@example.test`;
const password = 'Test-only-password-6868';
let cookie = '';

async function appFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      'X-Forwarded-Proto': 'https',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
}

const jars = [
  { id: 'jar-nec', code: 'NEC', name: 'Thiết yếu', accountNumber: '4523088888', accountName: 'NGUYEN QUANG TRUONG', bankCode: 'TCB', bankName: 'Techcombank', percentage: 50, color: '#00f', description: '', targetBudget: 500, currentSpent: 0 },
  { id: 'jar-ffa', code: 'FFA', name: 'Tự do', accountNumber: '1018754212', accountName: 'NGUYEN QUANG TRUONG', bankCode: 'VCB', bankName: 'Vietcombank', percentage: 50, color: '#0f0', description: '', targetBudget: 500, currentSpent: 0 },
];
const bankAccounts = jars.map((jar) => ({
  id: `bank-${jar.code}`,
  bankName: jar.bankName,
  bankCode: jar.bankCode,
  accountNumber: jar.accountNumber,
  accountHolder: jar.accountName,
  balance: 123,
  lastSynced: 'Chưa cập nhật',
  status: 'connected',
  linkedJarCode: jar.code,
}));

const tx = (id: string, direction: 'CRDT' | 'DBIT', amount: number, additions: any, extra: any = {}) => ({
  id,
  arrangementId: 'arr-tcb-main',
  reference: id,
  description: extra.description || id,
  creditDebitIndicator: direction,
  transactionAmountCurrency: { amount: String(amount), currencyCode: 'VND' },
  runningBalance: extra.runningBalance ?? 500,
  additions: { externalId: id, ...additions },
  state: 'COMPLETED',
  bookingDate: '2026-07-31',
  ...extra,
});

try {
  await appFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  const staleData = { monthlyIncome: 1000, jars, transactions: [], bankAccounts };
  await appFetch('/api/data', { method: 'PUT', body: JSON.stringify(staleData) });
  const { token } = await appFetch('/api/tcb/connector', { method: 'POST', body: '{}' });

  const transactions = [
    tx('transfer-incoming', 'CRDT', 300, { creditAcctNo: '4523088888', creditAcctName: 'NGUYEN QUANG TRUONG', accountDebitName: 'VND-BNK-CK247 NH KHAC – TK TCB' }, { description: 'MBVCB.15271102180. NGUYEN QUANG TRUONG chuyen tien.CT tu 1018754212 NGUYEN QUANG TRUONG toi 4523088888 NGUYEN QUANG TRUONG tai TECHCOMBANK', runningBalance: 900, creationTime: '2026-07-31T13:00:00+07:00' }),
    tx('income-other', 'CRDT', 200, { creditAcctNo: '4523088888', creditAcctName: 'NGUYEN QUANG TRUONG' }, { counterPartyName: 'NGUYEN VAN TUAN', runningBalance: 700, creationTime: '2026-07-31T12:00:00+07:00' }),
    tx('expense-other', 'DBIT', 50, { debitAcctNo: '4523088888', debitAcctName: 'NGUYEN QUANG TRUONG', creditAcctName: 'CUA HANG ABC' }, { counterPartyName: 'CUA HANG ABC', counterPartyAccountNumber: 'SHOP001', runningBalance: 500, creationTime: '2026-07-31T11:00:00+07:00' }),
    tx('transfer-debit', 'DBIT', 100, { debitAcctNo: '4523088888', creditAcctNo: '1018754212', debitAcctName: 'NGUYEN QUANG TRUONG', creditAcctName: 'NGUYEN QUANG TRUONG' }, { reference: 'transfer-ref', counterPartyName: 'NGUYEN QUANG TRUONG', counterPartyAccountNumber: '1018754212', creationTime: '2026-07-31T10:00:00+07:00' }),
    tx('transfer-credit', 'CRDT', 100, { debitAcctNo: '4523088888', creditAcctNo: '1018754212', debitAcctName: 'NGUYEN QUANG TRUONG', creditAcctName: 'NGUYEN QUANG TRUONG' }, { reference: 'transfer-ref', counterPartyName: 'NGUYEN QUANG TRUONG', counterPartyAccountNumber: '4523088888', runningBalance: 0, creationTime: '2026-07-31T10:00:00+07:00' }),
  ];

  const ingest = () => fetch(`${baseUrl}/api/tcb/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rofinance-connector-key': token },
    body: JSON.stringify({ transactions }),
  }).then(async (response) => ({ response, body: await response.json() }));

  // A stale full-state save racing the connector must not erase bank transactions.
  const [ingestResult] = await Promise.all([
    ingest(),
    appFetch('/api/data', { method: 'PUT', body: JSON.stringify(staleData) }),
  ]);
  assert.equal(ingestResult.response.ok, true, JSON.stringify(ingestResult.body));

  const loaded = await appFetch('/api/data');
  const auto = loaded.data.transactions.filter((item: any) => item.isAutoImported);
  assert.equal(auto.length, 4, 'paired transfer must be one record and survive stale PUT');
  assert.deepEqual(auto.map((item: any) => item.type).sort(), ['expense', 'income', 'transfer', 'transfer']);
  assert.equal(auto.find((item: any) => item.type === 'expense').jarId, 'jar-nec');
  assert.equal(auto.find((item: any) => item.type === 'income').jarId, 'jar-nec');
  const transfer = auto.find((item: any) => item.id === 'bank-tcb-transfer-debit');
  assert.equal(transfer.jarId, 'jar-nec');
  assert.equal(transfer.transferToJarId, 'jar-ffa');
  assert.equal(transfer.sourceBankCode, 'TCB');
  assert.equal(transfer.destinationBankCode, 'VCB');
  const incomingTransfer = auto.find((item: any) => item.id === 'bank-tcb-transfer-incoming');
  assert.equal(incomingTransfer.jarId, 'jar-ffa');
  assert.equal(incomingTransfer.transferToJarId, 'jar-nec');
  assert.equal(incomingTransfer.sourceBankCode, 'VCB');
  assert.equal(incomingTransfer.destinationBankCode, 'TCB');
  assert.equal(loaded.data.bankAccounts.find((account: any) => account.bankCode === 'TCB').balance, 900, 'newest running balance must win even when older items follow it');

  const second = await ingest();
  assert.equal(second.response.ok, true);
  assert.equal(second.body.recorded, 0, 'repeat sync must not duplicate records');
  const loadedAgain = await appFetch('/api/data');
  assert.equal(loadedAgain.data.transactions.filter((item: any) => item.isAutoImported).length, 4);

  console.log('TCB ingest integration: all assertions passed');
} finally {
  await pool.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  await pool.end();
}
