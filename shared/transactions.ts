/** A bank-only receipt never allocates funds to a jar. */
export function isBankOnlyIncome(transaction: { type?: unknown; bankAccountId?: unknown; jarId?: unknown }) {
  return transaction.type === 'income' && typeof transaction.bankAccountId === 'string'
    && transaction.bankAccountId.length > 0 && transaction.jarId === '';
}

/** A bank-only expense is recorded directly against a bank account, not a jar. */
export function isBankOnlyExpense(transaction: { type?: unknown; bankAccountId?: unknown; jarId?: unknown }) {
  return transaction.type === 'expense' && typeof transaction.bankAccountId === 'string'
    && transaction.bankAccountId.length > 0 && transaction.jarId === '';
}

export function isBankOnlyTransaction(transaction: { type?: unknown; bankAccountId?: unknown; jarId?: unknown }) {
  return isBankOnlyIncome(transaction) || isBankOnlyExpense(transaction);
}

export function isBankTransfer(transaction: { type?: unknown; bankAccountId?: unknown; transferToBankAccountId?: unknown; jarId?: unknown }) {
  return transaction.type === 'transfer' && transaction.jarId === '' &&
    typeof transaction.bankAccountId === 'string' && transaction.bankAccountId.length > 0 &&
    typeof transaction.transferToBankAccountId === 'string' && transaction.transferToBankAccountId.length > 0;
}
