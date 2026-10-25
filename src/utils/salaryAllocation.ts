import type { BankAccount, Jar, Transaction } from '../types';
import { bankAccountKey, getAccountTransactionNet, syncBankAccountsWithJars } from './bankAccounts';
import { allocateWholeUnits } from './jarPlans';
import { getFinancialCycleStart, parseLocalDate, toLocalDateKey } from './monthlyCycle';

export interface SalaryReceiptInput { bankAccountId: string | null; date: string; unlinkedBankAccountId?: string }

/** A replacement receipt, not an additional receipt on every allocation click. */
export function allocateSalary({ income, jars, accounts, transactions, receipt, resetDay, now = new Date() }: {
  income: number; jars: Jar[]; accounts: BankAccount[]; transactions: Transaction[];
  receipt: SalaryReceiptInput; resetDay: number; now?: Date;
}) {
  const date = parseLocalDate(receipt.date);
  const cycle = toLocalDateKey(getFinancialCycleStart(now, resetDay));
  if (!Number.isSafeInteger(income) || income <= 0 || income > 1_000_000_000_000_000 ||
    !date || receipt.date > toLocalDateKey(now) || toLocalDateKey(getFinancialCycleStart(date, resetDay)) !== cycle) {
    throw new Error('Số tiền hoặc ngày nhận lương trong chu kỳ hiện tại không hợp lệ.');
  }
  if (!jars.length || new Set(jars.map(j => j.id)).size !== jars.length ||
    jars.some(j => !Number.isFinite(j.percentage) || j.percentage < 0 || j.percentage > 100) ||
    Math.abs(jars.reduce((sum, j) => sum + j.percentage, 0) - 100) > 0.000001) {
    throw new Error('Tổng tỷ lệ phân bổ phải bằng 100%.');
  }
  // Migrate the baseline BEFORE adding new receipts/transfers, so legacy balances
  // are preserved without swallowing the new salary into their opening balance.
  const banks = syncBankAccountsWithJars(jars, accounts, transactions);
  const source = banks.find(a => a.id === receipt.bankAccountId);
  if (receipt.bankAccountId !== null && !source) throw new Error('Vui lòng chọn tài khoản nhận lương đã lưu.');
  const amounts = allocateWholeUnits(income, jars.map(j => j.percentage));
  const allocations = jars.flatMap((j, index) => amounts[index] ? [{ jarId: j.id, amount: amounts[index] }] : []);
  const oldReceipts = transactions.filter(t => t.salaryCycleStart === cycle && t.type === 'income');
  const base = transactions.filter(t => t.salaryCycleStart !== cycle);
  const finish = (entries: Transaction[]) => {
    const ids = new Set(entries.map(t => t.id));
    if (ids.size !== entries.length || base.some(t => ids.has(t.id))) throw new Error('Mã giao dịch phân bổ bị trùng. Vui lòng tải lại dữ liệu.');
    const next = [...base, ...entries];
    if (banks.some(a => (a.openingBalance ?? 0) + getAccountTransactionNet(next, a.id) < 0 &&
      (a.openingBalance ?? 0) + getAccountTransactionNet(transactions, a.id) >= 0)) {
      throw new Error('Không đủ số dư để điều chỉnh phân bổ lương đã ghi nhận. Vui lòng đối soát tài khoản trước.');
    }
    return { transactions: next, bankAccounts: syncBankAccountsWithJars(jars, banks, next), allocations };
  };
  const archivedReceipt = oldReceipts.find(t => t.allocations?.some(a => !jars.some(j => j.id === a.jarId)) || !jars.some(j => j.id === t.jarId));
  if (receipt.bankAccountId === null) {
    const fallback = banks.find(a => a.id === receipt.unlinkedBankAccountId);
    if (receipt.unlinkedBankAccountId !== undefined && !fallback) throw new Error('Tài khoản nhận phần chưa liên kết không hợp lệ.');
    const directGroups = new Map<string, { account: BankAccount; allocations: typeof allocations }>();
    jars.forEach((jar, index) => {
      if (!amounts[index]) return;
      const destination = banks.find(a => bankAccountKey(a) === bankAccountKey(jar)) || fallback;
      if (!destination) throw new Error('Hũ chưa liên kết ngân hàng. Vui lòng chọn tài khoản nhận phần này.');
      const group = directGroups.get(destination.id) || { account: destination, allocations: [] };
      group.allocations.push({ jarId: jar.id, amount: amounts[index] });
      directGroups.set(destination.id, group);
    });
    const usedIds = new Set(oldReceipts.map(t => t.id));
    let nextId = 0;
    const entries: Transaction[] = [...directGroups.values()].map(({ account, allocations: portions }) => {
      const old = oldReceipts.find(t => t.salarySource === 'external' && t.bankAccountId === account.id);
      let id = old?.id;
      if (!id) {
        do { id = `salary-direct:${cycle}:${nextId++}`; } while (usedIds.has(id));
        usedIds.add(id);
      }
      return { id, type: 'income',
        amount: portions.reduce((sum, a) => sum + a.amount, 0), jarId: portions[0].jarId,
        allocations: portions, bankAccountId: account.id, salaryCycleStart: cycle, salarySource: 'external',
        date: receipt.date, category: 'Lương', description: 'Nhận lương trực tiếp theo phân bổ',
        paymentMethodCode: account.bankCode, bankName: account.bankName };
    });
    if (archivedReceipt) throw new Error('Lương đã liên kết hũ lưu trữ. Không thể đổi cách nhận hoặc ghi đè phân bổ lịch sử.');
    return finish(entries);
  }
  // A saved salary account receives the whole payment before internal transfers.
  if (!source) throw new Error('Vui lòng chọn tài khoản nhận lương đã lưu.');
  const grouped = new Map<string, number>();
  jars.forEach((jar, index) => {
    const linked = banks.find(a => bankAccountKey(a) === bankAccountKey(jar));
    // Unlinked jars are budget envelopes: their cash stays in the salary account.
    const destination = linked?.id || source.id;
    grouped.set(destination, (grouped.get(destination) || 0) + amounts[index]);
  });
  const old = oldReceipts[0];
  const archivedAllocation = Boolean(archivedReceipt);
  if (archivedAllocation && oldReceipts.some(t => t.salarySource === 'external')) throw new Error('Lương đã liên kết hũ lưu trữ. Không thể đổi cách nhận hoặc ghi đè phân bổ lịch sử.');
  if (archivedAllocation && (old.amount !== income || old.bankAccountId !== source.id || old.date !== receipt.date)) {
    throw new Error('Lương đã liên kết hũ lưu trữ. Giữ nguyên số tiền, ngày và tài khoản nhận để phân bổ lại mà không ghi đè lịch sử.');
  }
  const salary: Transaction = archivedAllocation ? old : {
    id: old?.id || `salary:${cycle}`, type: 'income', amount: income,
    jarId: allocations[0].jarId, allocations, bankAccountId: source.id,
    salaryCycleStart: cycle, date: receipt.date, category: 'Lương', description: 'Lương và phân bổ theo chu kỳ',
    paymentMethodCode: source.bankCode, bankName: source.bankName,
  };
  const transfers: Transaction[] = [...grouped.entries()].flatMap(([id, amount]) => {
    if (!amount || id === source.id) return [];
    const destination = banks.find(a => a.id === id)!;
    return [{ id: `salary-transfer:${cycle}:${id}`, type: 'transfer', jarId: '',
      bankAccountId: source.id, transferToBankAccountId: id, amount,
      salaryCycleStart: cycle, date: receipt.date, category: 'Chuyển khoản nội bộ',
      description: 'Phân bổ lương giữa các tài khoản', paymentMethodCode: source.bankCode,
      bankName: source.bankName, sourceBankCode: source.bankCode, sourceAccountNumber: source.accountNumber,
      destinationBankCode: destination.bankCode, recipientAccount: destination.accountNumber }];
  });
  return finish([salary, ...transfers]);
}
