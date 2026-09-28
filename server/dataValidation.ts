import {
  findBankByCode,
  findPaymentMethodByCode,
  findPaymentMethodByName,
} from '../shared/banks';
import { CUSTOM_JAR_PLAN_ID, findJarPlan, JAR_PLAN_DEFINITIONS } from '../src/constants/jarPlans';

type DataRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is DataRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasSafeText = (value: unknown, maxLength: number, allowEmpty = false) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return (allowEmpty || normalized.length > 0) &&
    Array.from(normalized).length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(normalized);
};

const isOneOf = (value: unknown, options: readonly string[]) =>
  typeof value === 'string' && options.includes(value);

const isDateKey = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const validateCarryovers = (raw: unknown) => {
  if (!Array.isArray(raw)) return false;
  return raw.every((item) => isRecord(item) &&
    isDateKey(item.sourceCycleStart) &&
    isDateKey(item.sourceCycleEnd) &&
    item.sourceCycleStart <= item.sourceCycleEnd &&
    typeof item.amount === 'number' &&
    Number.isFinite(item.amount) && item.amount > 0 &&
    item.amount <= 1_000_000_000_000_000 &&
    (item.sourceJarId === undefined || hasSafeText(item.sourceJarId, 100)) &&
    (item.sourceJarCode === undefined || hasSafeText(item.sourceJarCode, 32)) &&
    (item.sourceJarName === undefined || hasSafeText(item.sourceJarName, 100)));
};

const validateBankPair = (item: DataRecord, label: string) => {
  const bankCode = typeof item.bankCode === 'string' ? item.bankCode.trim().toUpperCase() : '';
  const bankName = typeof item.bankName === 'string' ? item.bankName.trim() : '';
  if (!bankCode) {
    if (bankName && bankName !== 'Chưa cấu hình') return `${label}: ngân hàng chưa cấu hình không hợp lệ`;
    return undefined;
  }
  const bank = findBankByCode(bankCode);
  // The code is the allow-listed source of truth. Names from older clients may use
  // a full label, alias or different casing; they are replaced with the canonical
  // server-side name below instead of causing a false validation warning.
  if (!bank) return `${label}: mã ngân hàng không hợp lệ`;
  return undefined;
};

function validateJars(raw: unknown, allowDuplicateCodes = false, maxItems = 100): { value?: DataRecord[]; error?: string } {
  if (!Array.isArray(raw) || raw.length > maxItems) return { error: 'Danh sách hũ tài chính không hợp lệ' };
  const ids = new Set<string>();
  const codes = new Set<string>();
  const value: DataRecord[] = [];
  for (const rawJar of raw) {
    if (!isRecord(rawJar)) return { error: 'Dữ liệu hũ tài chính không hợp lệ' };
    if (!hasSafeText(rawJar.id, 100) || ids.has(rawJar.id as string)) {
      return { error: 'Mã hũ tài chính không hợp lệ hoặc bị trùng' };
    }
    ids.add(rawJar.id as string);
    if (!hasSafeText(rawJar.code, 32) || !hasSafeText(rawJar.name, 100)) {
      return { error: 'Mã hoặc tên hũ tài chính không hợp lệ' };
    }
    if (!allowDuplicateCodes && codes.has(rawJar.code as string)) {
      return { error: 'Mã hũ tài chính đang hoạt động bị trùng' };
    }
    codes.add(rawJar.code as string);
    if (typeof rawJar.percentage !== 'number' || !Number.isFinite(rawJar.percentage) ||
      rawJar.percentage < 0 || rawJar.percentage > 100 ||
      typeof rawJar.targetBudget !== 'number' || !Number.isFinite(rawJar.targetBudget) ||
      rawJar.targetBudget < 0 || rawJar.targetBudget > 1_000_000_000_000_000 ||
      typeof rawJar.currentSpent !== 'number' || !Number.isFinite(rawJar.currentSpent) ||
      rawJar.currentSpent < 0 || rawJar.currentSpent > 1_000_000_000_000_000) {
      return { error: 'Tỷ lệ hoặc số tiền của hũ tài chính không hợp lệ' };
    }
    const bankError = validateBankPair(rawJar, `Hũ ${String(rawJar.name || '')}`);
    if (bankError) return { error: bankError };
    const accountNumber = typeof rawJar.accountNumber === 'string' ? rawJar.accountNumber.trim() : '';
    if (accountNumber && !/^\d{6,19}$/.test(accountNumber)) {
      return { error: 'Số tài khoản của hũ phải gồm 6–19 chữ số' };
    }
    if (!hasSafeText(rawJar.accountName ?? '', 100, true)) {
      return { error: 'Tên chủ tài khoản của hũ không hợp lệ' };
    }
    if (rawJar.cycleAllocation !== undefined &&
      (typeof rawJar.cycleAllocation !== 'number' || !Number.isFinite(rawJar.cycleAllocation) ||
        rawJar.cycleAllocation < 0 || rawJar.cycleAllocation > 1_000_000_000_000_000)) {
      return { error: 'Khoản phân bổ hiện tại của hũ không hợp lệ' };
    }
    if (rawJar.carryovers !== undefined && !validateCarryovers(rawJar.carryovers)) {
      return { error: 'Nguồn tiền dư chuyển tiếp của hũ không hợp lệ' };
    }
    if (rawJar.transferredIn !== undefined && !validateCarryovers(rawJar.transferredIn)) {
      return { error: 'Nguồn tiền chuyển từ cấu hình hũ cũ không hợp lệ' };
    }
    if (rawJar.lastRolloverCycleStart !== undefined && !isDateKey(rawJar.lastRolloverCycleStart)) {
      return { error: 'Dấu mốc chuyển tiếp của hũ không hợp lệ' };
    }
    if (rawJar.carryovers !== undefined && rawJar.cycleAllocation !== undefined) {
      const expectedBudget = (rawJar.carryovers as DataRecord[])
        .reduce((total, item) => total + Number(item.amount), Number(rawJar.cycleAllocation)) +
        (Array.isArray(rawJar.transferredIn)
          ? (rawJar.transferredIn as DataRecord[]).reduce((total, item) => total + Number(item.amount), 0)
          : 0);
      if (typeof rawJar.targetBudget !== 'number' ||
        Math.abs(rawJar.targetBudget - expectedBudget) > 1) {
        return { error: 'Tổng khả dụng của hũ không khớp với phân bổ và tiền dư' };
      }
    }
    value.push({
      ...rawJar,
      bankCode: typeof rawJar.bankCode === 'string' ? rawJar.bankCode.trim().toUpperCase() : '',
      bankName: String(rawJar.bankCode || '').trim()
        ? findBankByCode(rawJar.bankCode)?.shortName
        : 'Chưa cấu hình',
      accountNumber,
      accountName: String(rawJar.accountName || '').trim(),
    });
  }
  return { value };
}

function validateBankAccounts(raw: unknown): { value?: DataRecord[]; error?: string } {
  if (!Array.isArray(raw) || raw.length > 100) return { error: 'Danh sách tài khoản ngân hàng không hợp lệ' };
  const ids = new Set<string>();
  const value: DataRecord[] = [];
  for (const rawAccount of raw) {
    if (!isRecord(rawAccount)) return { error: 'Dữ liệu tài khoản ngân hàng không hợp lệ' };
    if (!hasSafeText(rawAccount.id, 100) || ids.has(rawAccount.id as string)) {
      return { error: 'Mã tài khoản ngân hàng không hợp lệ hoặc bị trùng' };
    }
    ids.add(rawAccount.id as string);
    const bankError = validateBankPair(rawAccount, 'Tài khoản ngân hàng');
    if (bankError) return { error: bankError };
    const accountNumber = typeof rawAccount.accountNumber === 'string'
      ? rawAccount.accountNumber.trim()
      : '';
    if (!/^\d{6,19}$/.test(accountNumber)) {
      return { error: 'Số tài khoản ngân hàng phải gồm 6–19 chữ số' };
    }
    if (!hasSafeText(rawAccount.accountHolder, 100) ||
      !isOneOf(rawAccount.status, ['connected', 'disconnected', 'syncing'])) {
      return { error: 'Chủ tài khoản hoặc trạng thái tài khoản không hợp lệ' };
    }
    const balance = Number(rawAccount.balance);
    if (!Number.isFinite(balance) || balance < 0 || balance > 1_000_000_000_000_000) {
      return { error: 'Số dư tài khoản không hợp lệ' };
    }
    value.push({
      ...rawAccount,
      bankCode: String(rawAccount.bankCode).trim().toUpperCase(),
      bankName: findBankByCode(rawAccount.bankCode)?.shortName,
      accountNumber,
      accountHolder: String(rawAccount.accountHolder).trim(),
      balance,
    });
  }
  return { value };
}

function validateTransactions(
  raw: unknown,
  jars: DataRecord[],
  activeJarIds: Set<string>,
  existingTransactions: unknown,
): { value?: DataRecord[]; error?: string } {
  if (!Array.isArray(raw) || raw.length > 50_000) return { error: 'Danh sách giao dịch không hợp lệ' };
  const jarById = new Map(jars.map((jar) => [jar.id as string, jar]));
  const existingById = new Map(
    Array.isArray(existingTransactions)
      ? existingTransactions.filter(isRecord).map((transaction) => [transaction.id, transaction])
      : [],
  );
  const ids = new Set<string>();
  const value: DataRecord[] = [];
  for (const rawTransaction of raw) {
    if (!isRecord(rawTransaction)) return { error: 'Dữ liệu giao dịch không hợp lệ' };
    if (!hasSafeText(rawTransaction.id, 100) || ids.has(rawTransaction.id as string)) {
      return { error: 'Mã giao dịch không hợp lệ hoặc bị trùng' };
    }
    ids.add(rawTransaction.id as string);
    if (!isOneOf(rawTransaction.type, ['income', 'expense', 'transfer'])) {
      return { error: 'Loại giao dịch không hợp lệ' };
    }
    const amount = Number(rawTransaction.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000_000) {
      return { error: 'Số tiền giao dịch không hợp lệ' };
    }
    if (!hasSafeText(rawTransaction.jarId, 100) || !jarById.has(rawTransaction.jarId as string)) {
      return { error: 'Hũ của giao dịch không thuộc dữ liệu tài khoản hiện tại' };
    }
    const existingTransaction = existingById.get(rawTransaction.id);
    if (!activeJarIds.has(rawTransaction.jarId as string) &&
      (!existingTransaction || JSON.stringify(existingTransaction) !== JSON.stringify(rawTransaction))) {
      return { error: 'Không thể tạo hoặc sửa giao dịch trong hũ đã lưu trữ' };
    }
    if (!hasSafeText(rawTransaction.category, 100) || !hasSafeText(rawTransaction.description, 500)) {
      return { error: 'Danh mục hoặc ghi chú giao dịch không hợp lệ' };
    }
    if (rawTransaction.legacyPaymentLabel !== undefined &&
      !hasSafeText(rawTransaction.legacyPaymentLabel, 100)) {
      return { error: 'Nhãn phương thức cũ không hợp lệ' };
    }
    if (typeof rawTransaction.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rawTransaction.date) ||
      !Number.isFinite(Date.parse(`${rawTransaction.date}T00:00:00Z`))) {
      return { error: 'Ngày giao dịch không hợp lệ' };
    }

    if (rawTransaction.type === 'transfer') {
      const sourceJar = jarById.get(rawTransaction.jarId as string)!;
      const destinationJar = jarById.get(rawTransaction.transferToJarId as string);
      if (!destinationJar || destinationJar.id === sourceJar.id) {
        return { error: 'Hũ nhận của giao dịch chuyển hũ không hợp lệ' };
      }
      if (!activeJarIds.has(destinationJar.id as string) &&
        (!existingTransaction || JSON.stringify(existingTransaction) !== JSON.stringify(rawTransaction))) {
        return { error: 'Không thể chuyển tiền vào hũ đã lưu trữ' };
      }
      const sourceCode = String(sourceJar.bankCode || '');
      const sourceMethod = findPaymentMethodByCode(sourceCode || 'CASH');
      value.push({
        ...rawTransaction,
        amount,
        paymentMethodCode: sourceMethod!.code,
        bankName: sourceMethod!.shortName,
        sourceBankCode: sourceCode,
        destinationBankCode: String(destinationJar.bankCode || ''),
        sourceAccountNumber: String(sourceJar.accountNumber || ''),
        recipientAccount: String(destinationJar.accountNumber || ''),
      });
      continue;
    }

    const suppliedCode = typeof rawTransaction.paymentMethodCode === 'string'
      ? rawTransaction.paymentMethodCode.trim().toUpperCase()
      : '';
    const method = suppliedCode
      ? findPaymentMethodByCode(suppliedCode)
      : findPaymentMethodByName(rawTransaction.bankName);
    if (!method) {
      const existing = existingById.get(rawTransaction.id);
      const unchangedLegacyTransaction = existing &&
        !existing.paymentMethodCode &&
        JSON.stringify(existing) === JSON.stringify(rawTransaction);
      if (unchangedLegacyTransaction) {
        value.push({ ...rawTransaction, amount });
        continue;
      }
      return { error: 'Phương thức hoặc ngân hàng của giao dịch không hợp lệ' };
    }
    if (rawTransaction.bankName !== undefined && rawTransaction.bankName !== method.shortName) {
      return { error: 'Tên ngân hàng không khớp với phương thức đã chọn' };
    }
    value.push({
      ...rawTransaction,
      amount,
      paymentMethodCode: method.code,
      bankName: method.shortName,
    });
  }
  const rawById = new Map(
    (raw as unknown[]).filter(isRecord).map((transaction) => [transaction.id, transaction])
  );
  for (const existing of existingById.values()) {
    const referencesArchivedJar =
      !activeJarIds.has(existing.jarId as string) ||
      (typeof existing.transferToJarId === 'string' && !activeJarIds.has(existing.transferToJarId));
    if (referencesArchivedJar) {
      const submitted = rawById.get(existing.id);
      if (!submitted || JSON.stringify(submitted) !== JSON.stringify(existing)) {
        return { error: 'Giao dịch của hũ đã lưu trữ phải được giữ nguyên' };
      }
    }
  }
  return { value };
}

function validateJarPlanSnapshots(raw: unknown) {
  if (raw === undefined) return { value: [] as DataRecord[] };
  if (!Array.isArray(raw) || raw.length > 5000) {
    return { error: 'Lịch sử cấu hình hũ không hợp lệ' };
  }
  const ids = new Set<string>();
  const value: DataRecord[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !hasSafeText(item.id, 100) || ids.has(item.id as string) ||
      !hasSafeText(item.name, 100) || !hasSafeText(item.sourcePlanId, 100) ||
      typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) {
      return { error: 'Lịch sử cấu hình hũ không hợp lệ' };
    }
    const jarsResult = validateJars(item.jars);
    if (!jarsResult.value) return { error: 'Dữ liệu hũ trong lịch sử cấu hình không hợp lệ' };
    ids.add(item.id as string);
    value.push({ ...item, jars: jarsResult.value });
  }
  return { value };
}

function validateOtherOptionFields(data: DataRecord, jars: DataRecord[]) {
  const jarCodes = new Set(jars.map((jar) => jar.code));
  if (data.preferences !== undefined) {
    if (!isRecord(data.preferences) ||
      !isOneOf(data.preferences.language, ['vi', 'en']) ||
      !isOneOf(data.preferences.currency, ['VND', 'USD']) ||
      !isOneOf(data.preferences.theme, ['dark', 'light', 'system']) ||
      !Number.isInteger(data.preferences.monthlyResetDay) ||
      Number(data.preferences.monthlyResetDay) < 1 || Number(data.preferences.monthlyResetDay) > 31 ||
      !Number.isFinite(Number(data.preferences.usdVndRate)) || Number(data.preferences.usdVndRate) <= 0) {
      return 'Tùy chọn ứng dụng không hợp lệ';
    }
  }
  if (data.cryptoAssets !== undefined) {
    if (!Array.isArray(data.cryptoAssets) || data.cryptoAssets.some((asset) =>
      !isRecord(asset) ||
      (asset.exchange !== undefined && !isOneOf(asset.exchange, ['Binance', 'OKX', 'Bybit'])) ||
      (asset.linkedJarCode !== undefined && !jarCodes.has(asset.linkedJarCode))
    )) return 'Sàn giao dịch tiền mã hóa không hợp lệ';
  }
  if (data.safetyInvestments !== undefined) {
    const safetyInvestmentIds = new Set<string>();
    if (!Array.isArray(data.safetyInvestments) || data.safetyInvestments.length > 1000 ||
      data.safetyInvestments.some((item) => {
        if (!isRecord(item) || !hasSafeText(item.id, 100) ||
          safetyInvestmentIds.has(item.id as string) ||
          !isOneOf(item.providerType, ['tikop', 'bank', 'other']) ||
          !hasSafeText(item.providerName, 100) || !hasSafeText(item.productName, 100) ||
          typeof item.principalAmount !== 'number' || !Number.isFinite(item.principalAmount) ||
          item.principalAmount <= 0 || item.principalAmount > 1_000_000_000_000_000 ||
          typeof item.annualInterestRate !== 'number' || !Number.isFinite(item.annualInterestRate) ||
          item.annualInterestRate < 0 || item.annualInterestRate > 1000 ||
          !isDateKey(item.startDate) || !isDateKey(item.maturityDate) ||
          item.startDate > item.maturityDate ||
          !hasSafeText(item.notes ?? '', 1000, true)) return true;
        safetyInvestmentIds.add(item.id as string);
        if (item.withdrawals === undefined) return false;
        if (!Array.isArray(item.withdrawals) || item.withdrawals.length > 1000) return true;
        const ids = new Set<string>();
        let withdrawn = 0;
        for (const withdrawal of item.withdrawals) {
          if (!isRecord(withdrawal) || !hasSafeText(withdrawal.id, 100) ||
            ids.has(withdrawal.id as string) ||
            typeof withdrawal.amount !== 'number' || !Number.isFinite(withdrawal.amount) ||
            withdrawal.amount <= 0 || withdrawal.amount > 1_000_000_000_000_000 ||
            !isDateKey(withdrawal.date) || withdrawal.date < item.startDate ||
            withdrawal.date > new Date().toISOString().slice(0, 10) ||
            !hasSafeText(withdrawal.notes ?? '', 500, true) ||
            typeof withdrawal.createdAt !== 'string' ||
            !Number.isFinite(Date.parse(withdrawal.createdAt))) return true;
          ids.add(withdrawal.id as string);
          withdrawn += withdrawal.amount as number;
        }
        return withdrawn > (item.principalAmount as number);
      })) return 'Dữ liệu khoản gửi hoặc lịch sử rút quỹ an toàn không hợp lệ';
  }
  if (data.debtItems !== undefined) {
    if (!Array.isArray(data.debtItems) || data.debtItems.some((debt) => !isRecord(debt) ||
      !isOneOf(debt.status, ['active', 'paid']) ||
      (debt.calculationMode !== undefined && !isOneOf(debt.calculationMode, ['total', 'calculated'])) ||
      (debt.conversionFeeMode !== undefined && !isOneOf(debt.conversionFeeMode, ['upfront', 'distributed'])) ||
      (debt.interestRatePeriod !== undefined && !isOneOf(debt.interestRatePeriod, ['annual', 'monthly'])) ||
      (debt.reallocateTargetCode !== undefined &&
        debt.reallocateTargetCode !== 'PROPORTIONAL' &&
        !jarCodes.has(debt.reallocateTargetCode))
    )) return 'Tùy chọn khoản nợ không hợp lệ';
  }
  if (data.customCategories !== undefined) {
    if (!Array.isArray(data.customCategories) || data.customCategories.some((category) =>
      !isRecord(category) ||
      (category.type === 'expense' && !jarCodes.has(category.jarCode))
    )) return 'Hũ liên kết với danh mục không hợp lệ';
  }
  if (data.monthlySummaries !== undefined) {
    if (!Array.isArray(data.monthlySummaries) || data.monthlySummaries.some((summary) => {
      if (!isRecord(summary) || !hasSafeText(summary.id, 100) ||
        !isDateKey(summary.cycleStart) || !isDateKey(summary.cycleEnd) ||
        summary.cycleStart > summary.cycleEnd) return true;
      if (summary.jarBreakdown === undefined) return false;
      return !Array.isArray(summary.jarBreakdown) || summary.jarBreakdown.some((item) =>
        !isRecord(item) || !hasSafeText(item.jarId, 100) || !hasSafeText(item.jarCode, 32) ||
        !hasSafeText(item.jarName, 100) ||
        (item.openingCarryovers !== undefined && !validateCarryovers(item.openingCarryovers)) ||
        (item.transferredIn !== undefined && !validateCarryovers(item.transferredIn)) ||
        (item.transferredInAmount !== undefined &&
          (typeof item.transferredInAmount !== 'number' || !Number.isFinite(item.transferredInAmount) || item.transferredInAmount < 0)) ||
        (item.isArchived !== undefined && typeof item.isArchived !== 'boolean') ||
        !validateCarryovers(item.closingCarryovers)
      );
    })) return 'Dữ liệu tổng kết chu kỳ không hợp lệ';
  }
  return undefined;
}

export function validateAndNormalizeUserData(
  data: DataRecord,
  existingData: DataRecord = {},
): { value?: DataRecord; error?: string } {
  const result: DataRecord = { ...data };
  const jarsResult = validateJars(data.jars ?? []);
  if (!jarsResult.value) return { error: jarsResult.error };
  result.jars = jarsResult.value;

  const archivedJarsResult = validateJars(data.archivedJars ?? [], true, 5000);
  if (!archivedJarsResult.value) return { error: archivedJarsResult.error };
  const activeJarIds = new Set(jarsResult.value.map((jar) => jar.id as string));
  if (archivedJarsResult.value.some((jar) => activeJarIds.has(jar.id as string))) {
    return { error: 'Hũ đang hoạt động và hũ lưu trữ bị trùng' };
  }
  result.archivedJars = archivedJarsResult.value;
  const allJars = [...jarsResult.value, ...archivedJarsResult.value];

  const snapshotsResult = validateJarPlanSnapshots(data.jarPlanSnapshots);
  if (!snapshotsResult.value) return { error: snapshotsResult.error };
  result.jarPlanSnapshots = snapshotsResult.value;
  const activeJarPlanId = data.activeJarPlanId ?? CUSTOM_JAR_PLAN_ID;
  const validPlanIds = new Set([
    CUSTOM_JAR_PLAN_ID,
    ...JAR_PLAN_DEFINITIONS.map((plan) => plan.id),
    ...snapshotsResult.value.map((snapshot) => `snapshot-${snapshot.id}`),
  ]);
  if (!hasSafeText(activeJarPlanId, 100) || !validPlanIds.has(activeJarPlanId as string)) {
    return { error: 'Mã kiểu phân bổ hũ không hợp lệ' };
  }
  const activePlan = findJarPlan(activeJarPlanId as string);
  const activeSnapshot = snapshotsResult.value.find(
    (snapshot) => `snapshot-${snapshot.id}` === activeJarPlanId
  );
  const expectedAllocations = activePlan?.allocations ||
    (activeSnapshot?.jars as DataRecord[] | undefined)?.map((jar) => ({
      code: jar.code,
      percentage: jar.percentage,
    }));
  if (expectedAllocations && (
    expectedAllocations.length !== jarsResult.value.length ||
    expectedAllocations.some((expected) => {
      const jar = jarsResult.value!.find((item) => item.code === expected.code);
      return !jar || typeof jar.percentage !== 'number' ||
        Math.abs(Number(jar.percentage) - Number(expected.percentage)) > 0.01;
    })
  )) return { error: 'Danh sách hũ không khớp với kiểu phân bổ đã chọn' };
  result.activeJarPlanId = activeJarPlanId;

  const optionError = validateOtherOptionFields(data, allJars);
  if (optionError) return { error: optionError };

  const accountsResult = validateBankAccounts(data.bankAccounts ?? []);
  if (!accountsResult.value) return { error: accountsResult.error };
  const jarCodes = new Set(allJars.map((jar) => jar.code));
  if (accountsResult.value.some((account) =>
    account.linkedJarCode !== undefined && !jarCodes.has(account.linkedJarCode)
  )) return { error: 'Hũ liên kết với tài khoản ngân hàng không hợp lệ' };
  result.bankAccounts = accountsResult.value;

  const transactionsResult = validateTransactions(
    data.transactions ?? [],
    allJars,
    activeJarIds,
    existingData.transactions,
  );
  if (!transactionsResult.value) return { error: transactionsResult.error };
  result.transactions = transactionsResult.value;
  return { value: result };
}
