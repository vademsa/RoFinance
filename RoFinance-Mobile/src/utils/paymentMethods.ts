import type { Jar, Transaction } from '../types';
import {
  CASH_PAYMENT_METHOD,
  findPaymentMethodByCode,
  findPaymentMethodByName,
} from '../../shared/banks';

export function migrateTransactionPaymentMethods(
  transactions: Transaction[],
  jars: Jar[],
) {
  let changed = false;
  const jarById = new Map(jars.map((jar) => [jar.id, jar]));
  const migratedItems = transactions.map((transaction) => {
    const sourceJar = jarById.get(transaction.jarId);
    const method = transaction.type === 'transfer'
      ? findPaymentMethodByCode(sourceJar?.bankCode) || CASH_PAYMENT_METHOD
      : findPaymentMethodByCode(transaction.paymentMethodCode) ||
        findPaymentMethodByName(transaction.bankName) ||
        CASH_PAYMENT_METHOD;
    const legacyPaymentLabel = !findPaymentMethodByCode(transaction.paymentMethodCode) &&
      transaction.bankName &&
      !findPaymentMethodByName(transaction.bankName)
      ? transaction.bankName.trim().slice(0, 100)
      : transaction.legacyPaymentLabel;
    const nextTransaction: Transaction = {
      ...transaction,
      paymentMethodCode: method.code,
      bankName: method.shortName,
      ...(legacyPaymentLabel ? { legacyPaymentLabel } : {}),
    };
    if (transaction.type === 'transfer' && sourceJar) {
      nextTransaction.sourceBankCode = sourceJar.bankCode;
      nextTransaction.sourceAccountNumber = sourceJar.accountNumber;
      const destinationJar = jarById.get(transaction.transferToJarId || '');
      if (destinationJar) {
        nextTransaction.destinationBankCode = destinationJar.bankCode;
        nextTransaction.recipientAccount = destinationJar.accountNumber;
      }
    }
    if (JSON.stringify(nextTransaction) !== JSON.stringify(transaction)) changed = true;
    return nextTransaction;
  });
  return { migratedItems, changed };
}
