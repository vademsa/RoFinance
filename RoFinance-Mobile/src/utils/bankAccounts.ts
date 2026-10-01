import { BankAccount, Jar } from '../types';

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

export function syncBankAccountsWithJars(jars: Jar[], accounts: BankAccount[]) {
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
    return {
      id: current?.id || `bank-${firstJar.id}`,
      bankName: firstJar.bankName,
      bankCode: normalizeBankCode(firstJar.bankCode),
      accountNumber: firstJar.accountNumber.trim(),
      accountHolder: firstJar.accountName || current?.accountHolder || '',
      balance: getDerivedBankBalance(jars, firstJar),
      lastSynced: current?.lastSynced || 'Tự động từ hũ',
      status: 'connected' as const,
      linkedJarCode: linkedJars.length === 1 ? firstJar.code : undefined,
      isManuallyAdded: Boolean(current?.isManuallyAdded),
    };
  });
  const linkedKeys = new Set(linkedAccounts.map(bankAccountKey));
  const standaloneAccounts = currentAccounts.filter((account) => (
    account.isManuallyAdded && !linkedKeys.has(bankAccountKey(account))
  ));

  return [...linkedAccounts, ...standaloneAccounts];
}
