import { BankAccount, Jar, Transaction } from '../types';
import { isBankOnlyIncome } from '../../shared/transactions';
import { findBankByCode } from '../../shared/banks';

const BANK_CODE_ALIASES: Record<string, string> = {
  TECHCOMBANK: 'TCB',
  VIETNAMTECHNOLOGICALANDCOMMERCIALJOINTSTOCKBANK: 'TCB',
  CAKEBYVPBANK: 'CAKE',
  NGANHANGSOCAKEBYVPBANK: 'CAKE',
  UNITEDOVERSEASBANK: 'UOB',
  UOBVIETNAM: 'UOB',
};

export function normalizeAccountNumber(value: string | undefined) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function normalizeBankCode(value: string | undefined) {
  const normalized = String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return BANK_CODE_ALIASES[normalized] || normalized;
}

export function bankAccountKey(account: Pick<BankAccount, 'bankCode' | 'accountNumber'>) {
  return `${normalizeBankCode(account.bankCode)}:${normalizeAccountNumber(account.accountNumber)}`;
}

export function deduplicateBankAccounts(accounts: BankAccount[]) {
  const unique = new Map<string, BankAccount>();

  accounts.forEach((account) => {
    const normalizedNumber = normalizeAccountNumber(account.accountNumber);
    if (!normalizedNumber) return;

    const key = bankAccountKey(account);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, account);
      return;
    }

    // Keep the strongest saved state when legacy data contains duplicate rows.
    const preferred = (normalizeBankCode(account.bankCode) === 'TCB' && normalizeBankCode(existing.bankCode) !== 'TCB') ||
      account.lastSynced > existing.lastSynced ||
      (existing.balance === 0 && account.balance !== 0)
      ? account
      : existing;
    unique.set(key, {
      ...preferred,
      bankCode: normalizeBankCode(preferred.bankCode),
      accountNumber: preferred.accountNumber.trim(),
    });
  });

  return Array.from(unique.values());
}

export function getJarsLinkedToBankAccount(
  jars: Jar[],
  account: Pick<BankAccount, 'bankCode' | 'accountNumber'>,
) {
  const key = bankAccountKey(account);
  return jars.filter((jar) => (
    normalizeAccountNumber(jar.accountNumber)
    && bankAccountKey(jar) === key
  ));
}

export function getStatementJarOptions(
  jars: Jar[],
  account: Pick<BankAccount, 'bankCode' | 'accountNumber'>,
  transactionDate: string,
  currentCycleStart: string,
  previousCycleStart: string,
  previousJarIds: Set<string>,
) {
  if (transactionDate < previousCycleStart) return [];
  const linked = getJarsLinkedToBankAccount(jars, account);
  return transactionDate < currentCycleStart
    ? linked.filter((jar) => previousJarIds.has(jar.id))
    : linked;
}

export function getStatementManualJarOptions(
  jars: Jar[],
  account: Pick<BankAccount, 'bankCode' | 'accountNumber'>,
  transactionDate: string,
  currentCycleStart: string,
  previousCycleStart: string,
  previousJarIds: Set<string>,
) {
  if (transactionDate < previousCycleStart) return [];
  // A historical jar may have changed bank accounts since that cycle. Manual
  // reconciliation may use it, but only if its snapshot can correct carryover.
  return transactionDate < currentCycleStart
    ? jars.filter((jar) => previousJarIds.has(jar.id))
    : getJarsLinkedToBankAccount(jars, account);
}

export function linkJarToBankAccount(jar: Jar, account: BankAccount): Jar {
  const bank = findBankByCode(account.bankCode);
  const accountNumber = account.accountNumber.trim();
  const accountHolder = account.accountHolder.trim();
  if (!bank || !/^\d{6,19}$/.test(accountNumber) || !accountHolder) {
    throw new Error('Tài khoản ngân hàng đã lưu không hợp lệ.');
  }
  return {
    ...jar,
    bankCode: bank.code,
    bankName: bank.shortName,
    accountNumber,
    accountName: accountHolder,
  };
}

export function getDerivedBankBalance(
  jars: Jar[],
  account: Pick<BankAccount, 'bankCode' | 'accountNumber'>,
) {
  const balance = getJarsLinkedToBankAccount(jars, account).reduce(
    (total, jar) => total + jar.targetBudget - jar.currentSpent,
    0,
  );
  return Math.max(0, Math.round(balance));
}

export function editBankAccountDetails(
  jars: Jar[],
  accounts: BankAccount[],
  accountId: string,
  details: Pick<BankAccount, 'bankCode' | 'accountNumber' | 'accountHolder'>,
  transactions: Transaction[] = [],
) {
  const original = accounts.find((account) => account.id === accountId);
  if (!original) throw new Error('Không tìm thấy tài khoản cần chỉnh sửa.');
  const bank = findBankByCode(details.bankCode);
  const accountNumber = details.accountNumber.trim();
  const accountHolder = details.accountHolder.trim().toUpperCase();
  if (!bank || !/^\d{6,19}$/.test(accountNumber) || !accountHolder || accountHolder.length > 100) {
    throw new Error('Ngân hàng, số tài khoản hoặc tên chủ tài khoản không hợp lệ.');
  }
  const newKey = bankAccountKey({ bankCode: bank.code, accountNumber });
  if (accounts.some((account) => account.id !== accountId && bankAccountKey(account) === newKey)) {
    throw new Error('Tài khoản ngân hàng này đã có trong danh sách.');
  }
  const oldKey = bankAccountKey(original);
  const updatedJars = jars.map((jar) => bankAccountKey(jar) === oldKey
    ? { ...jar, bankCode: bank.code, bankName: bank.shortName, accountNumber, accountName: accountHolder }
    : jar);
  const updatedAccounts = syncBankAccountsWithJars(updatedJars, accounts.map((account) => account.id === accountId
    ? { ...account, bankCode: bank.code, bankName: bank.shortName, accountNumber, accountHolder }
    : account), transactions);
  return { jars: updatedJars, bankAccounts: updatedAccounts };
}

export function getBankOnlyIncomeTotal(transactions: Transaction[], accountId: string) {
  return transactions.filter((transaction) => isBankOnlyIncome(transaction) && transaction.bankAccountId === accountId)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function getBankAccountBalance(jars: Jar[], account: BankAccount, transactions: Transaction[] = []) {
  const linked = getJarsLinkedToBankAccount(jars, account).length > 0;
  const opening = account.unallocatedOpeningBalance ?? (linked ? 0 : account.balance);
  const jarBalance = getJarsLinkedToBankAccount(jars, account).reduce((total, jar) => total + jar.targetBudget - jar.currentSpent, 0);
  return Math.max(0, Math.round(jarBalance
    + opening + getBankOnlyIncomeTotal(transactions, account.id)));
}

export function syncBankAccountsWithJars(jars: Jar[], accounts: BankAccount[], transactions: Transaction[] = []): BankAccount[] {
  const currentAccounts = deduplicateBankAccounts(accounts);
  const jarsByAccount = new Map<string, Jar[]>();

  jars.forEach((jar) => {
    if (!normalizeAccountNumber(jar.accountNumber) || !normalizeBankCode(jar.bankCode)) return;
    const key = bankAccountKey(jar);
    jarsByAccount.set(key, [...(jarsByAccount.get(key) || []), jar]);
  });

  const linkedAccounts = Array.from(jarsByAccount.entries()).map(([key, linkedJars]) => {
    const firstJar = linkedJars[0];
    const current = currentAccounts.find((account) => bankAccountKey(account) === key);
    const account = {
      id: current?.id || `bank-${firstJar.id}`,
      bankName: firstJar.bankName,
      bankCode: normalizeBankCode(firstJar.bankCode),
      accountNumber: firstJar.accountNumber.trim(),
      accountHolder: firstJar.accountName || current?.accountHolder || '',
      balance: 0,
      unallocatedOpeningBalance: current?.unallocatedOpeningBalance ?? 0,
      lastSynced: current?.lastSynced || 'Tự động từ hũ',
      status: 'connected' as const,
      linkedJarCode: linkedJars.length === 1 ? firstJar.code : undefined,
      isManuallyAdded: Boolean(current?.isManuallyAdded),
    };
    return { ...account, balance: getBankAccountBalance(jars, account, transactions) };
  });
  const linkedKeys = new Set(linkedAccounts.map(bankAccountKey));
  const standaloneAccounts = currentAccounts.filter((account) => (
    (account.isManuallyAdded || transactions.some((transaction) => isBankOnlyIncome(transaction) && transaction.bankAccountId === account.id))
      && !linkedKeys.has(bankAccountKey(account))
  )).map((account) => {
    const initialized = { ...account, unallocatedOpeningBalance: account.unallocatedOpeningBalance ?? account.balance };
    return { ...initialized, balance: getBankAccountBalance(jars, initialized, transactions) };
  });

  return [...linkedAccounts, ...standaloneAccounts];
}
