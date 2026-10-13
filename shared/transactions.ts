/** A bank-only receipt never allocates funds to a jar. */
export function isBankOnlyIncome(transaction: { type?: unknown; bankAccountId?: unknown; jarId?: unknown }) {
  return transaction.type === 'income' && typeof transaction.bankAccountId === 'string'
    && transaction.bankAccountId.length > 0 && transaction.jarId === '';
}
