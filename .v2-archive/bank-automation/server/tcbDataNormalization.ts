const normalizeAccount = (value: unknown) =>
  String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const isTCB = (value: unknown) => {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized === 'TCB' || normalized.includes('TECHCOMBANK');
};

const canonicalBankCode = (value: unknown) => {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (normalized === 'TCB' || normalized.includes('TECHCOMBANK')) return 'TCB';
  if (normalized === 'VCB' || normalized.includes('VIETCOMBANK') || normalized.includes('NGOAITHUONG')) return 'VCB';
  return normalized;
};

function deduplicateAccounts(accounts: any[]) {
  const unique = new Map<string, any>();
  accounts.forEach((account) => {
    const key = normalizeAccount(account?.accountNumber);
    if (!key) return;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, account);
      return;
    }
    const preferCandidate =
      (isTCB(account?.bankCode) && !isTCB(existing?.bankCode)) ||
      (existing?.balance === 0 && account?.balance !== 0) ||
      String(account?.lastSynced || '') > String(existing?.lastSynced || '');
    unique.set(key, preferCandidate ? account : existing);
  });
  return [...unique.values()];
}

export function normalizeTCBUserData(data: any) {
  if (!data || typeof data !== 'object') return data;
  const jars = Array.isArray(data.jars) ? data.jars : [];
  const necJar = jars.find((jar: any) => String(jar?.code || '').toUpperCase() === 'NEC');
  const bankAccounts = Array.isArray(data.bankAccounts)
    ? deduplicateAccounts(data.bankAccounts).map((account: any) =>
        isTCB(account?.bankCode) || isTCB(account?.bankName)
          ? { ...account, bankCode: 'TCB', linkedJarCode: 'NEC' }
          : account
      )
    : data.bankAccounts;
  const jarByCode = new Map(jars.map((jar: any) => [String(jar?.code || ''), jar]));
  const jarByAccount = new Map<string, any>();
  const bankByAccount = new Map<string, string>();
  jars.forEach((jar: any) => {
    const account = normalizeAccount(jar?.accountNumber);
    if (account && !jarByAccount.has(account)) jarByAccount.set(account, jar);
    if (account && !bankByAccount.has(account)) bankByAccount.set(account, canonicalBankCode(jar?.bankCode || jar?.bankName));
  });
  if (Array.isArray(bankAccounts)) {
    bankAccounts.forEach((account: any) => {
      const accountNumber = normalizeAccount(account?.accountNumber);
      const linkedJar = jarByCode.get(String(account?.linkedJarCode || ''));
      if (accountNumber && linkedJar) jarByAccount.set(accountNumber, linkedJar);
      if (accountNumber) bankByAccount.set(accountNumber, canonicalBankCode(account?.bankCode || account?.bankName));
    });
  }
  const necAccount = normalizeAccount(
    (Array.isArray(bankAccounts) ? bankAccounts.find((account: any) => canonicalBankCode(account?.bankCode || account?.bankName) === 'TCB')?.accountNumber : '') ||
    necJar?.accountNumber
  );
  const transactions = Array.isArray(data.transactions) && necJar
    ? data.transactions.map((transaction: any) => {
        if (!transaction?.isAutoImported || !isTCB(transaction?.bankName)) return transaction;
        if (transaction.type === 'transfer') {
          const sourceAccount = normalizeAccount(transaction.sourceAccountNumber);
          const destinationAccount = normalizeAccount(transaction.recipientAccount);
          const isIncomingToTCB = destinationAccount === necAccount ||
            String(transaction.description || '').toUpperCase().includes('MBVCB');
          if (isIncomingToTCB) {
            const sourceJar = jarByAccount.get(sourceAccount);
            return {
              ...transaction,
              jarId: sourceJar?.id || transaction.jarId || '',
              transferToJarId: necJar.id,
              sourceBankCode: bankByAccount.get(sourceAccount) ||
                (String(transaction.description || '').toUpperCase().includes('MBVCB') ? 'VCB' : canonicalBankCode(transaction.sourceBankCode)),
              destinationBankCode: 'TCB',
            };
          }
          const destinationJar = jarByAccount.get(destinationAccount);
          return {
            ...transaction,
            jarId: necJar.id,
            transferToJarId: destinationJar?.id || transaction.transferToJarId,
            sourceBankCode: 'TCB',
            destinationBankCode: bankByAccount.get(destinationAccount) || canonicalBankCode(transaction.destinationBankCode || transaction.recipientBank),
          };
        }
        return { ...transaction, jarId: necJar.id };
      })
    : data.transactions;
  return { ...data, bankAccounts, transactions };
}
