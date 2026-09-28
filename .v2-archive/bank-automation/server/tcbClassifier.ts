type JarLike = {
  id: string;
  code?: string;
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
  bankName?: string;
};

type BankAccountLike = {
  accountNumber?: string;
  accountHolder?: string;
  linkedJarCode?: string;
};

export const normalizeAccount = (value: unknown) =>
  String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const normalizePersonName = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export function inferBankCodeFromTCBDetails(value: unknown) {
  const details = String(value || '').toUpperCase();
  if (details.includes('MBVCB')) return 'VCB';
  return '';
}

export function buildTCBOwnership(jars: JarLike[], bankAccounts: BankAccountLike[]) {
  const jarByCode = new Map(jars.map((jar) => [String(jar.code || ''), jar]));
  const jarByAccount = new Map<string, JarLike>();
  const jarsByAccount = new Map<string, JarLike[]>();
  const ownedAccounts = new Set<string>();

  bankAccounts.forEach((bankAccount) => {
    const account = normalizeAccount(bankAccount.accountNumber);
    if (account) ownedAccounts.add(account);
  });
  jars.forEach((jar) => {
    const account = normalizeAccount(jar.accountNumber);
    if (!account) return;
    ownedAccounts.add(account);
    jarsByAccount.set(account, [...(jarsByAccount.get(account) || []), jar]);
  });
  jarsByAccount.forEach((accountJars, account) => {
    const necJar = accountJars.find((jar) =>
      String(jar.code || '').toUpperCase() === 'NEC' &&
      String(jar.bankCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === 'TCB'
    );
    if (accountJars.length === 1 || necJar) jarByAccount.set(account, necJar || accountJars[0]);
  });
  bankAccounts.forEach((bankAccount) => {
    const account = normalizeAccount(bankAccount.accountNumber);
    const linkedJar = jarByCode.get(String(bankAccount.linkedJarCode || ''));
    if (account && linkedJar) jarByAccount.set(account, linkedJar);
  });

  const ownerNames = new Set<string>();
  [...jars.map((jar) => jar.accountName), ...bankAccounts.map((account) => account.accountHolder)]
    .map(normalizePersonName)
    .filter((name) => name.length >= 5)
    .forEach((name) => ownerNames.add(name));

  return { jarByAccount, ownedAccounts, ownerNames };
}

const nameMatchesOwner = (value: unknown, ownerNames: Set<string>) => {
  const name = normalizePersonName(value);
  if (!name) return false;
  return [...ownerNames].some((owner) => name === owner || name.includes(owner));
};

export function classifyTCBTransaction(
  item: any,
  ownership: ReturnType<typeof buildTCBOwnership>,
  arrangementAccounts: Map<string, string> = new Map()
) {
  const direction = item?.creditDebitIndicator === 'CRDT' ? 'CRDT' : item?.creditDebitIndicator === 'DBIT' ? 'DBIT' : '';
  const additions = item?.additions || {};
  const arrangementId = String(item?.arrangementId || '');
  const explicitCurrentAccount = normalizeAccount(
    direction === 'DBIT' ? additions.debitAcctNo : additions.creditAcctNo
  );
  const currentAccount = explicitCurrentAccount || arrangementAccounts.get(arrangementId) || '';
  let counterpartyAccount = normalizeAccount(
    item?.counterPartyAccountNumber ||
    (direction === 'DBIT' ? additions.creditAcctNo : additions.debitAcctNo) ||
    additions.accountNoOth
  );
  const details = `${item?.description || ''} ${additions.additionalInfo || ''}`;
  if (!counterpartyAccount && currentAccount) {
    const searchableDetails = normalizeAccount(details);
    counterpartyAccount = [...ownership.ownedAccounts].find((account) =>
      account !== currentAccount && account.length >= 6 && searchableDetails.includes(account)
    ) || '';
  }
  const sourceJar = ownership.jarByAccount.get(currentAccount);
  const counterpartyJar = ownership.jarByAccount.get(counterpartyAccount);

  const senderName = direction === 'CRDT'
    ? item?.counterPartyName || additions.debitAcctName
    : additions.debitAcctName || additions.accountDebitName;
  const recipientName = direction === 'DBIT'
    ? item?.counterPartyName || additions.creditAcctName || additions.accountCreditName
    : additions.creditAcctName || additions.accountCreditName;
  const currentIsOwn = ownership.ownedAccounts.has(currentAccount);
  const counterpartyIsOwn = ownership.ownedAccounts.has(counterpartyAccount);
  const accountEvidence = Boolean(
    currentIsOwn && counterpartyIsOwn && currentAccount !== counterpartyAccount
  );
  const nameEvidence = direction === 'CRDT'
    ? nameMatchesOwner(senderName, ownership.ownerNames) ||
      (!normalizePersonName(senderName) && nameMatchesOwner(details, ownership.ownerNames))
    : nameMatchesOwner(recipientName, ownership.ownerNames);
  const isInternalTransfer = accountEvidence || Boolean(currentIsOwn && nameEvidence);

  return {
    direction,
    currentAccount,
    counterpartyAccount,
    counterpartyName: String(direction === 'CRDT' ? senderName || '' : recipientName || '').trim(),
    sourceJar,
    counterpartyJar,
    isInternalTransfer,
    transactionType: isInternalTransfer ? 'transfer' : direction === 'CRDT' ? 'income' : 'expense',
  } as const;
}

export function buildArrangementAccountMap(items: any[]) {
  const result = new Map<string, string>();
  items.forEach((item) => {
    const direction = item?.creditDebitIndicator;
    const additions = item?.additions || {};
    const account = normalizeAccount(direction === 'DBIT' ? additions.debitAcctNo : additions.creditAcctNo);
    const arrangementId = String(item?.arrangementId || '');
    if (account && arrangementId) result.set(arrangementId, account);
  });
  return result;
}
