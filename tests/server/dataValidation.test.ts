import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAndNormalizeUserData } from '../../server/dataValidation';

const jar = {
  id: 'jar-nec',
  code: 'NEC',
  name: 'Nhu cầu thiết yếu',
  percentage: 40,
  bankName: 'Techcombank',
  bankCode: 'TCB',
  accountNumber: '123456789',
  accountName: 'NGUYEN AN',
  color: '#3B82F6',
  description: 'Chi tiêu thiết yếu',
  targetBudget: 4_000_000,
  currentSpent: 0,
};

const account = {
  id: 'bank-1',
  bankName: 'Techcombank',
  bankCode: 'TCB',
  accountNumber: '123456789',
  accountHolder: 'NGUYEN AN',
  balance: 1_000_000,
  lastSynced: 'Chưa cập nhật',
  status: 'connected',
};

const transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: 150_000,
  jarId: jar.id,
  category: 'Ăn sáng',
  date: '2026-08-28',
  description: 'Bữa sáng',
  paymentMethodCode: 'TCB',
  bankName: 'Techcombank',
};

const baseData = {
  jars: [jar],
  bankAccounts: [account],
  transactions: [transaction],
  preferences: {
    language: 'vi',
    currency: 'VND',
    theme: 'dark',
    usdVndRate: 26_000,
    monthlyResetDay: 25,
  },
};

const bankReceipt = { ...transaction, type: 'income', jarId: '', bankAccountId: account.id, amount: 200_000, category: 'Thu nhập khác' };

test('shared expense categories work with any owned jar and retired legacy category metadata does not block saving', () => {
  const categories = [{ id: 'custom-old', name: 'Chi chung', type: 'expense', icon: 'gift', jarCode: 'OLD_REMOVED_JAR' },
    { id: 'custom-shared', name: 'Chi chung mới', type: 'expense', icon: 'coffee' }];
  const result = validateAndNormalizeUserData({ ...baseData, customCategories: categories,
    transactions: [{ ...transaction, categoryId: 'custom-old', category: 'Chi chung', categoryIcon: 'gift' }] });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value?.customCategories, categories);
  assert.equal((result.value!.transactions as any[])[0].jarId, jar.id);
  assert.equal((result.value!.transactions as any[])[0].categoryId, 'custom-old');
  assert.ok(validateAndNormalizeUserData({ ...baseData, customCategories: [{ ...categories[0], jarCode: '<invalid>' }] }).error);
  assert.ok(validateAndNormalizeUserData({ ...baseData, customCategories: categories, transactions: [{ ...transaction, jarId: 'foreign-user-jar', categoryId: 'custom-old' }] }).error);
});

test('bank-only income accepts saved accounts and derives its bank identity from the account', () => {
  const result = validateAndNormalizeUserData({ ...baseData, transactions: [{ ...bankReceipt, bankName: 'Ignored display label' }] });
  assert.equal(result.error, undefined);
  const saved = (result.value!.transactions as any[])[0];
  assert.equal(saved.bankAccountId, account.id);
  assert.equal(saved.jarId, '');
  assert.equal(saved.bankName, 'Techcombank');
  assert.equal(saved.allocations, undefined);
  assert.equal(validateAndNormalizeUserData({ ...baseData, jars: [], transactions: [bankReceipt] }).error, undefined);
});

test('bank-only receipts reject unknown/foreign account IDs, mixed jars and forged transaction modes', () => {
  for (const invalid of [
    { ...bankReceipt, bankAccountId: 'other-users-account' },
    { ...bankReceipt, bankAccountId: { id: account.id } },
    { ...bankReceipt, jarId: jar.id },           // jarId must be '' for bank-only
    { ...bankReceipt, allocations: [{ jarId: jar.id, amount: 200_000 }] },
    { ...bankReceipt, allocations: 'invalid' },
    { ...bankReceipt, type: 'transfer' },          // transfer type is still invalid
    { ...bankReceipt, transferToJarId: jar.id },
    { ...bankReceipt, date: '2026-02-30' },
    { ...bankReceipt, paymentMethodCode: 'EVIL' },
  ]) assert.ok(validateAndNormalizeUserData({ ...baseData, transactions: [invalid] }).error);
  assert.ok(validateAndNormalizeUserData({ ...baseData, bankAccounts: [], transactions: [bankReceipt] }).error);
});

test('bank-only expense accepts saved accounts and does not affect jar balances', () => {
  const bankExpense = { ...transaction, type: 'expense', jarId: '', bankAccountId: account.id };
  const result = validateAndNormalizeUserData({ ...baseData, transactions: [bankExpense] });
  assert.equal(result.error, undefined);
  const saved = (result.value!.transactions as any[])[0];
  assert.equal(saved.type, 'expense');
  assert.equal(saved.bankAccountId, account.id);
  assert.equal(saved.jarId, '');
  assert.equal(saved.bankName, 'Techcombank');
  // A personal expense may independently select a real bank account and a budget jar.
  assert.equal(validateAndNormalizeUserData({ ...baseData, transactions: [{ ...bankExpense, jarId: jar.id }] }).error, undefined);
});


test('bank-only receipts remain editable/deletable without an archived-jar lock', () => {
  const original = { ...baseData, transactions: [bankReceipt] };
  assert.equal(validateAndNormalizeUserData({ ...original, transactions: [{ ...bankReceipt, amount: 300_000 }] }, original).error, undefined);
  assert.equal(validateAndNormalizeUserData({ ...original, transactions: [] }, original).error, undefined);
  assert.ok(validateAndNormalizeUserData({ ...original, bankAccounts: [] }, original).error);
});

test('unallocated reconciliations must be finite bounded numbers', () => {
  for (const invalid of ['0', NaN, Infinity, 1e16]) {
    assert.ok(validateAndNormalizeUserData({ ...baseData, bankAccounts: [{ ...account, unallocatedOpeningBalance: invalid }] }).error);
  }
  assert.equal(validateAndNormalizeUserData({ ...baseData, bankAccounts: [{ ...account, unallocatedOpeningBalance: -500 }] }).error, undefined);
});

test('accepts a legitimate option-backed payment method', () => {
  const result = validateAndNormalizeUserData(baseData);
  assert.equal(result.error, undefined);
  assert.equal((result.value?.transactions as any[])[0].paymentMethodCode, 'TCB');
  assert.equal((result.value?.transactions as any[])[0].bankName, 'Techcombank');
});

test('rejects duplicate or malformed imported bank references', () => {
  const duplicate = validateAndNormalizeUserData({
    ...baseData,
    transactions: [
      { ...transaction, bankTransactionId: 'TCB:123456789:REF-1' },
      { ...transaction, id: 'tx-2', bankTransactionId: 'TCB:123456789:REF-1' },
    ],
  });
  assert.match(duplicate.error || '', /Mã bút toán.*trùng/);
  const malformed = validateAndNormalizeUserData({
    ...baseData,
    transactions: [{ ...transaction, bankTransactionId: 'REF\n2' }],
  });
  assert.match(malformed.error || '', /Mã bút toán.*không hợp lệ/);
});

test('rejects an unknown method code and a spoofed bank display name', () => {
  const unknownCode = validateAndNormalizeUserData({
    ...baseData,
    transactions: [{ ...transaction, paymentMethodCode: 'EVIL', bankName: 'Ngân hàng giả' }],
  });
  assert.match(unknownCode.error || '', /không hợp lệ/);

  const spoofedName = validateAndNormalizeUserData({
    ...baseData,
    transactions: [{ ...transaction, bankName: '<img src=x onerror=alert(1)>' }],
  });
  assert.match(spoofedName.error || '', /không khớp/);
});

test('rejects tampered bank account configuration outside the canonical registry', () => {
  const result = validateAndNormalizeUserData({
    ...baseData,
    bankAccounts: [{ ...account, bankCode: 'FAKE', bankName: 'Fake Bank' }],
  });
  assert.match(result.error || '', /mã ngân hàng không hợp lệ/);
});

test('canonicalizes a stale bank name when its allow-listed code is valid', () => {
  const result = validateAndNormalizeUserData({
    ...baseData,
    jars: [{ ...jar, name: 'Quỹ an toàn', bankName: 'TECHCOMBANK (tên dữ liệu cũ)' }],
    bankAccounts: [{ ...account, bankName: 'Ngân hàng Kỹ Thương' }],
  });
  assert.equal(result.error, undefined);
  assert.equal((result.value?.jars as any[])[0].bankName, 'Techcombank');
  assert.equal((result.value?.bankAccounts as any[])[0].bankName, 'Techcombank');
});

test('accepts and canonicalizes Cake and UOB in jars and bank accounts', () => {
  const cakeJar = {
    ...jar,
    bankCode: 'cake',
    bankName: 'Tên Cake do client tự gửi',
  };
  const uobAccount = {
    ...account,
    bankCode: 'uob',
    bankName: 'Tên UOB do client tự gửi',
  };
  const result = validateAndNormalizeUserData({
    ...baseData,
    jars: [cakeJar],
    bankAccounts: [uobAccount],
    transactions: [{
      ...transaction,
      jarId: cakeJar.id,
      paymentMethodCode: 'CAKE',
      bankName: 'Cake by VPBank',
    }],
  });

  assert.equal(result.error, undefined);
  assert.equal((result.value?.jars as any[])[0].bankCode, 'CAKE');
  assert.equal((result.value?.jars as any[])[0].bankName, 'Cake by VPBank');
  assert.equal((result.value?.bankAccounts as any[])[0].bankCode, 'UOB');
  assert.equal((result.value?.bankAccounts as any[])[0].bankName, 'UOB Việt Nam');
});

test('derives transfer bank fields from the selected jars', () => {
  const destination = {
    ...jar,
    id: 'jar-play',
    code: 'PLAY',
    name: 'Hưởng thụ',
    bankCode: 'VCB',
    bankName: 'Vietcombank',
    accountNumber: '987654321',
  };
  const result = validateAndNormalizeUserData({
    ...baseData,
    jars: [jar, destination],
    transactions: [{
      ...transaction,
      type: 'transfer',
      transferToJarId: destination.id,
      paymentMethodCode: 'EVIL',
      bankName: 'Giá trị giả',
      sourceBankCode: 'FAKE',
      destinationBankCode: 'FAKE',
    }],
  });
  const normalized = (result.value?.transactions as any[])[0];
  assert.equal(result.error, undefined);
  assert.equal(normalized.paymentMethodCode, 'TCB');
  assert.equal(normalized.bankName, 'Techcombank');
  assert.equal(normalized.sourceBankCode, 'TCB');
  assert.equal(normalized.destinationBankCode, 'VCB');
});

test('changing a linked jar bank keeps unchanged historical transfer bank details', () => {
  const destination = { ...jar, id: 'jar-play', code: 'PLAY', name: 'Hưởng thụ',
    bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321' };
  const historicalTransfer = { ...transaction, id: 'tx-transfer-old', type: 'transfer',
    transferToJarId: destination.id, paymentMethodCode: 'TCB', bankName: 'Techcombank',
    sourceBankCode: 'TCB', destinationBankCode: 'VCB', sourceAccountNumber: '123456789',
    recipientAccount: '987654321' };
  const data = { ...baseData, jars: [{ ...jar, bankCode: 'MB', bankName: 'MB',
    accountNumber: '111222333' }, destination], transactions: [historicalTransfer] };
  const result = validateAndNormalizeUserData(data, { transactions: [historicalTransfer] });
  assert.equal(result.error, undefined);
  assert.deepEqual((result.value?.transactions as any[])[0], historicalTransfer);
});

test('keeps an unchanged legacy label but rejects it on a new transaction', () => {
  const legacy = { ...transaction, paymentMethodCode: undefined, bankName: 'Ngân hàng cũ' };
  const preserved = validateAndNormalizeUserData(
    { ...baseData, transactions: [legacy] },
    { transactions: [legacy] },
  );
  assert.equal(preserved.error, undefined);

  const modifiedLegacy = validateAndNormalizeUserData(
    { ...baseData, transactions: [{ ...legacy, amount: legacy.amount + 1 }] },
    { transactions: [legacy] },
  );
  assert.match(modifiedLegacy.error || '', /không hợp lệ/);

  const injected = validateAndNormalizeUserData({ ...baseData, transactions: [legacy] });
  assert.match(injected.error || '', /không hợp lệ/);
});

test('rejects values that bypass other option controls', () => {
  const invalidPreference = validateAndNormalizeUserData({
    ...baseData,
    preferences: { ...baseData.preferences, theme: 'server-side-script' },
  });
  assert.match(invalidPreference.error || '', /Tùy chọn ứng dụng/);

  const invalidStatus = validateAndNormalizeUserData({
    ...baseData,
    bankAccounts: [{ ...account, status: 'admin' }],
  });
  assert.match(invalidStatus.error || '', /trạng thái/);

  const invalidJarReference = validateAndNormalizeUserData({
    ...baseData,
    cryptoAssets: [{ id: 'coin-1', linkedJarCode: 'OTHER_USER_JAR' }],
  });
  assert.match(invalidJarReference.error || '', /tiền mã hóa/);
});

test('validates safety-fund withdrawal history and prevents over-withdrawal', () => {
  const investment = {
    id: 'safe-investment-1',
    providerType: 'bank',
    providerName: 'Techcombank',
    productName: 'Tiết kiệm linh hoạt',
    principalAmount: 10_000_000,
    annualInterestRate: 5.5,
    startDate: '2026-01-01',
    maturityDate: '2027-01-01',
    notes: '',
    withdrawals: [{
      id: 'safe-withdrawal-1',
      amount: 3_000_000,
      date: '2026-08-29',
      notes: 'Rút một phần',
      createdAt: '2026-08-29T10:00:00.000Z',
    }],
  };
  assert.equal(validateAndNormalizeUserData({
    ...baseData,
    safetyInvestments: [investment],
  }).error, undefined);

  const overdrawn = validateAndNormalizeUserData({
    ...baseData,
    safetyInvestments: [{
      ...investment,
      withdrawals: [{ ...investment.withdrawals[0], amount: 10_000_001 }],
    }],
  });
  assert.match(overdrawn.error || '', /lịch sử rút/);
});

test('validates carryover provenance and its budget invariant', () => {
  const validJar = {
    ...jar,
    cycleAllocation: 800_000,
    carryovers: [{
      sourceCycleStart: '2026-07-25',
      sourceCycleEnd: '2026-08-24',
      amount: 200_000,
    }],
    targetBudget: 1_000_000,
  };
  assert.equal(validateAndNormalizeUserData({ ...baseData, jars: [validJar] }).error, undefined);

  const invalidTotal = validateAndNormalizeUserData({
    ...baseData,
    jars: [{ ...validJar, targetBudget: 999_000 }],
  });
  assert.match(invalidTotal.error || '', /không khớp/);

  const invalidSource = validateAndNormalizeUserData({
    ...baseData,
    jars: [{
      ...validJar,
      carryovers: [{ ...validJar.carryovers[0], sourceCycleStart: 'not-a-date' }],
    }],
  });
  assert.match(invalidSource.error || '', /Nguồn tiền dư/);
});

test('keeps historical transactions that reference an archived jar but rejects new ones', () => {
  const archivedJar = {
    ...jar,
    id: 'jar-debt-old',
    code: 'DEBT',
    name: 'Trả nợ cũ',
  };
  const historical = { ...transaction, id: 'tx-old-debt', jarId: archivedJar.id };
  const data = {
    ...baseData,
    archivedJars: [archivedJar],
    transactions: [historical],
    activeJarPlanId: 'custom',
    jarPlanSnapshots: [],
  };
  const preserved = validateAndNormalizeUserData(data, { transactions: [historical] });
  assert.equal(preserved.error, undefined);

  const injected = validateAndNormalizeUserData({
    ...data,
    transactions: [{ ...historical, id: 'tx-new-in-archive' }],
  }, { transactions: [historical] });
  assert.match(injected.error || '', /hũ đã lưu trữ/);

  const deleted = validateAndNormalizeUserData({ ...data, transactions: [] }, {
    transactions: [historical],
  });
  assert.match(deleted.error || '', /phải được giữ nguyên/);
});

test('validates plan ids against predefined plans and saved snapshots', () => {
  const invalid = validateAndNormalizeUserData({
    ...baseData,
    activeJarPlanId: 'admin-plan',
    jarPlanSnapshots: [],
  });
  assert.match(invalid.error || '', /Mã kiểu phân bổ/);

  const snapshot = {
    id: 'jar-plan-1',
    name: 'Cấu hình cũ',
    sourcePlanId: 'custom',
    jars: [jar],
    createdAt: '2026-08-29T10:00:00.000Z',
  };
  const valid = validateAndNormalizeUserData({
    ...baseData,
    activeJarPlanId: `snapshot-${snapshot.id}`,
    jarPlanSnapshots: [snapshot],
  });
  assert.equal(valid.error, undefined);
});

test('includes transferred plan money in the jar budget invariant', () => {
  const transferredJar = {
    ...jar,
    cycleAllocation: 800_000,
    carryovers: [],
    transferredIn: [{
      sourceCycleStart: '2026-07-25',
      sourceCycleEnd: '2026-08-24',
      sourceJarId: 'jar-debt-old',
      sourceJarCode: 'DEBT',
      sourceJarName: 'Trả nợ',
      amount: 200_000,
    }],
    targetBudget: 1_000_000,
  };
  assert.equal(validateAndNormalizeUserData({ ...baseData, jars: [transferredJar] }).error, undefined);
  const invalid = validateAndNormalizeUserData({
    ...baseData,
    jars: [{ ...transferredJar, targetBudget: 999_998 }],
  });
  assert.match(invalid.error || '', /không khớp/);
});
