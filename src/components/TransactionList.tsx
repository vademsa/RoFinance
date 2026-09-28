import React, { useState } from 'react';
import { Search, Trash2, PlusCircle, Landmark, RefreshCw, WalletCards, CalendarRange, Pencil } from 'lucide-react';
import { BankAccount, Jar, MonthlyCycleSummary, Transaction, TransactionCategory } from '../types';
import { formatVND, formatDateVI } from '../utils/formatters';
import { CurrencyInput } from './CurrencyInput';
import {
  deduplicateBankAccounts,
  getDerivedBankBalance,
  getJarsLinkedToBankAccount,
} from '../utils/bankAccounts';
import { CategoryIcon } from './CategoryIcon';
import { findTransactionCategory } from '../constants/categories';
import {
  getCycleTransactions,
  getBackdatableJarIds,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  getPreviousFinancialCycleStart,
  isDateInCycle,
  parseLocalDate,
  toLocalDateKey,
} from '../utils/monthlyCycle';
import { groupTransactionsByDate } from '../utils/transactionHistory';

const formatTransactionGroupDate = (dateKey: string) => {
  const date = parseLocalDate(dateKey);
  if (!date) return dateKey;
  const current = new Date();
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  const prefix = dateKey === toLocalDateKey(current)
    ? 'Hôm nay'
    : dateKey === toLocalDateKey(yesterday)
      ? 'Hôm qua'
      : new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date);
  return `${prefix} · ${formatDateVI(dateKey)}`;
};

interface TransactionListProps {
  transactions: Transaction[];
  jars: Jar[];
  customCategories: TransactionCategory[];
  onDeleteTransaction: (id: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenTransactionModal: () => void;
  isAmountsHidden?: boolean;
  bankAccounts: BankAccount[];
  onUpdateBankBalance: (accountId: string, balance: number) => Promise<void>;
  monthlySummaries: MonthlyCycleSummary[];
  resetDay: number;
  activeJarIds: string[];
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  jars,
  customCategories,
  onDeleteTransaction,
  onEditTransaction,
  onOpenTransactionModal,
  isAmountsHidden = false,
  bankAccounts,
  onUpdateBankBalance,
  monthlySummaries,
  resetDay,
  activeJarIds,
}) => {

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJarFilter, setSelectedJarFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedCycleId, setSelectedCycleId] = useState<string>('CURRENT_CYCLE');
  const [balanceInputs, setBalanceInputs] = useState<Record<string, number | ''>>({});
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [balanceMessage, setBalanceMessage] = useState('');
  const uniqueAccounts = deduplicateBankAccounts(bankAccounts);
  const activeJars = jars.filter((jar) => activeJarIds.includes(jar.id));

  const saveBalance = async (account: BankAccount) => {
    const value = balanceInputs[account.id] ?? account.balance;
    if (value === '' || value < 0) return;
    setSavingAccountId(account.id);
    setBalanceMessage('');
    try {
      await onUpdateBankBalance(account.id, value);
      setBalanceMessage(`Đã cập nhật số dư ${account.bankName}.`);
    } catch (error: any) {
      setBalanceMessage(error.message || 'Không thể cập nhật số dư tài khoản');
    } finally {
      setSavingAccountId(null);
    }
  };

  const currentCycleStart = getFinancialCycleStart(new Date(), resetDay);
  const currentCycleEnd = getNextFinancialCycleStart(currentCycleStart, resetDay);
  const previousCycleStart = getPreviousFinancialCycleStart(new Date(), resetDay);
  const previousSummary = monthlySummaries.find(
    (summary) => summary.cycleStart === toLocalDateKey(previousCycleStart),
  );
  const backdatableJarIds = getBackdatableJarIds(previousSummary);
  const selectedSummaryId = selectedCycleId.startsWith('CYCLE:')
    ? selectedCycleId.slice('CYCLE:'.length)
    : selectedCycleId;
  const selectedSummary = monthlySummaries.find((item) => item.id === selectedSummaryId);
  const selectedCycleTransactions = selectedCycleId === 'ALL'
    ? transactions
    : selectedCycleId === 'CURRENT_CYCLE'
      ? getCycleTransactions(transactions, currentCycleStart, currentCycleEnd)
      : (() => {
          const start = selectedSummary ? parseLocalDate(selectedSummary.cycleStart) : null;
          const inclusiveEnd = selectedSummary ? parseLocalDate(selectedSummary.cycleEnd) : null;
          if (!start || !inclusiveEnd) return [];
          const end = new Date(inclusiveEnd);
          end.setDate(end.getDate() + 1);
          return getCycleTransactions(transactions, start, end);
        })();

  const filteredTransactions = selectedCycleTransactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesJar = selectedJarFilter === 'ALL' || tx.jarId === selectedJarFilter;
    const matchesType = selectedTypeFilter === 'ALL' || tx.type === selectedTypeFilter;

    return matchesSearch && matchesJar && matchesType;
  });
  const transactionGroups = groupTransactionsByDate(filteredTransactions);
  const visibleTotals = transactionGroups.reduce(
    (totals, group) => ({
      income: totals.income + group.income,
      expense: totals.expense + group.expense,
      transfer: totals.transfer + group.transfer,
      count: totals.count + group.transactions.length,
    }),
    { income: 0, expense: 0, transfer: 0, count: 0 },
  );
  const currentCycleEndInclusive = new Date(currentCycleEnd);
  currentCycleEndInclusive.setDate(currentCycleEndInclusive.getDate() - 1);
  const selectedPeriodLabel = selectedCycleId === 'ALL'
    ? 'Toàn bộ lịch sử'
    : selectedCycleId === 'CURRENT_CYCLE'
      ? `Chu kỳ ${formatDateVI(toLocalDateKey(currentCycleStart))} – ${formatDateVI(toLocalDateKey(currentCycleEndInclusive))}`
      : selectedSummary
        ? `Chu kỳ ${formatDateVI(selectedSummary.cycleStart)} – ${formatDateVI(selectedSummary.cycleEnd)}`
        : 'Chu kỳ đã chọn';

  return (
    <div className="bg-[#121214] rounded-[28px] border border-zinc-800 shadow-xl p-6 space-y-6 text-zinc-100">
      <section className="space-y-2" aria-labelledby="current-account-balances-title">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-indigo-400" aria-hidden="true" />
            <h2 id="current-account-balances-title" className="text-sm font-black text-white">
              Số Dư Tài Khoản Hiện Tại
            </h2>
          </div>
          <p className="text-[10px] text-zinc-500">
            Tổng tiền khả dụng từ các hũ cùng liên kết.
          </p>
        </div>
        {balanceMessage && <div role="status" className="rounded-lg border border-zinc-800 bg-[#18181b] px-2.5 py-1.5 text-[10px] text-zinc-300">{balanceMessage}</div>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {uniqueAccounts.map((account) => {
            const linkedJars = getJarsLinkedToBankAccount(activeJars, account);
            const isDerivedFromJars = linkedJars.length > 0;
            const displayedBalance = isDerivedFromJars
              ? getDerivedBankBalance(activeJars, account)
              : account.balance;
            return (
            <article key={account.id} className="rounded-xl border border-zinc-800 bg-[#18181b] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-white">
                    <Landmark className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                    <span className="truncate">{account.bankName}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[9px] text-zinc-500" title={`${account.accountNumber} · ${account.accountHolder}`}>
                    {account.accountNumber} · {account.accountHolder}
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-zinc-700 px-1.5 py-0.5 text-[8px] font-bold text-zinc-400">{account.bankCode}</span>
              </div>
              {isDerivedFromJars ? (
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-1.5">
                  <span className="text-[9px] font-semibold text-zinc-500">Khả dụng · {linkedJars.length} hũ</span>
                  <span className="truncate font-mono text-sm font-black text-indigo-300">{formatVND(displayedBalance, isAmountsHidden)}</span>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-1.5 border-t border-zinc-800/80 pt-1.5">
                  <CurrencyInput value={balanceInputs[account.id] ?? account.balance} onValueChange={(value) => setBalanceInputs((current) => ({ ...current, [account.id]: value }))} min={0} aria-label={`Số dư ${account.bankName}`} className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-[#121214] px-2 text-right font-mono text-xs font-black text-white" />
                  <button type="button" onClick={() => saveBalance(account)} disabled={savingAccountId === account.id} aria-label={`Lưu số dư ${account.bankName}`} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${savingAccountId === account.id ? 'animate-spin' : ''}`} /></button>
                </div>
              )}
              {!isDerivedFromJars && <div className="mt-1 flex items-center justify-between gap-2 text-[8px] text-zinc-600"><span className="truncate">Đã lưu: {formatVND(account.balance, isAmountsHidden)}</span><span className="shrink-0">{account.lastSynced}</span></div>}
            </article>
            );
          })}
          {uniqueAccounts.length === 0 && <div className="rounded-xl border border-dashed border-zinc-700 p-3 text-center text-[10px] text-zinc-500 sm:col-span-2 lg:col-span-3 xl:col-span-4">Hãy cấu hình ngân hàng và số tài khoản trong các hũ trước.</div>}
        </div>
      </section>

      <div className="border-t border-zinc-800" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Nhật Ký Giao Dịch Dòng Tiền</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Lịch sử biến động thu chi và phân bổ hũ tài chính được lưu trữ bảo mật
          </p>
        </div>

        <button
          onClick={onOpenTransactionModal}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Ghi Nhận Giao Dịch Mới</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 bg-[#1c1c20] p-3 rounded-2xl border border-zinc-800">
        <div className="relative">
          <CalendarRange className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="transaction-cycle-filter" className="sr-only">Chọn chu kỳ giao dịch</label>
          <select
            id="transaction-cycle-filter"
            value={selectedCycleId}
            onChange={(event) => setSelectedCycleId(event.target.value)}
            className="w-full py-2 pl-9 pr-3 text-xs font-bold bg-[#121214] border border-zinc-700 rounded-xl text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <optgroup label="Theo chu kỳ tài chính">
              <option value="CURRENT_CYCLE">
                Chu kỳ hiện tại: {formatDateVI(toLocalDateKey(currentCycleStart))} – {formatDateVI(toLocalDateKey(currentCycleEndInclusive))}
              </option>
            {[...monthlySummaries]
              .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))
              .map((summary) => (
                <option key={summary.id} value={`CYCLE:${summary.id}`}>
                  {formatDateVI(summary.cycleStart)} – {formatDateVI(summary.cycleEnd)}
                </option>
              ))}
            </optgroup>
            <option value="ALL">Toàn bộ lịch sử</option>
          </select>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo nội dung, danh mục..."
            className="w-full pl-9 pr-3 py-2 text-xs font-medium bg-[#121214] border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Jar Filter */}
        <div>
          <select
            value={selectedJarFilter}
            onChange={(e) => setSelectedJarFilter(e.target.value)}
            className="w-full p-2 text-xs font-bold bg-[#121214] border border-zinc-700 rounded-xl text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Tất cả Hũ Tài Chính</option>
            {jars.map((j) => (
              <option key={j.id} value={j.id}>
                Hũ {j.name} ({j.code}){activeJarIds.includes(j.id) ? '' : ' · đã lưu trữ'}
              </option>
            ))}
          </select>
        </div>

        {/* Type Filter */}
        <div>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="w-full p-2 text-xs font-bold bg-[#121214] border border-zinc-700 rounded-xl text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Tất cả loại giao dịch</option>
            <option value="expense">Chỉ xem Chi tiêu</option>
            <option value="income">Chỉ xem Thu nhập</option>
            <option value="transfer">Chỉ xem Chuyển tài khoản</option>
          </select>
        </div>
      </div>

      <section aria-live="polite" className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black text-indigo-300">{selectedPeriodLabel}</div>
            <div className="mt-1 text-[10px] text-zinc-400">Số liệu phản ánh các bộ lọc đang được chọn bên trên.</div>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[10px] sm:flex sm:items-center sm:gap-5">
            <div><span className="text-zinc-500">Giao dịch</span><strong className="ml-1.5 font-mono text-white">{visibleTotals.count}</strong></div>
            <div><span className="text-zinc-500">Thu</span><strong className="ml-1.5 font-mono text-emerald-300">+{formatVND(visibleTotals.income, isAmountsHidden)}</strong></div>
            <div><span className="text-zinc-500">Chi</span><strong className="ml-1.5 font-mono text-rose-300">-{formatVND(visibleTotals.expense, isAmountsHidden)}</strong></div>
            <div><span className="text-zinc-500">Chuyển</span><strong className="ml-1.5 font-mono text-sky-300">{formatVND(visibleTotals.transfer, isAmountsHidden)}</strong></div>
          </div>
        </div>
      </section>

      {/* Table */}
      <div className="border border-zinc-800 rounded-2xl overflow-hidden shadow-lg bg-[#18181b]/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-[#18181b] text-zinc-400 text-[11px] font-bold uppercase tracking-wider border-b border-zinc-800">
                <th className="p-3.5">Ngày</th>
                <th className="p-3.5">Nội dung & Danh mục</th>
                <th className="p-3.5">Hũ Tài Chính</th>
                <th className="p-3.5">Ngân hàng</th>
                <th className="p-3.5 text-right">Số tiền</th>
                <th className="p-3.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-xs">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 font-medium">
                    Không tìm thấy giao dịch nào phù hợp.
                  </td>
                </tr>
              ) : (
                transactionGroups.map((group) => (
                  <React.Fragment key={group.date}>
                    <tr className="border-y-2 border-indigo-500/25 bg-indigo-500/10">
                      <td
                        id={`transaction-date-${group.date}`}
                        colSpan={6}
                        role="heading"
                        aria-level={3}
                        className="px-3.5 py-2.5"
                      >
                        <div className="sticky left-3.5 flex w-[calc(100vw-5rem)] max-w-[500px] flex-col items-start gap-2 sm:w-[calc(100vw-8rem)] md:static md:w-auto md:max-w-none md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-2">
                            <CalendarRange className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                            <span className="text-xs font-black capitalize text-indigo-300">
                              {formatTransactionGroupDate(group.date)}
                            </span>
                            <span className="rounded-full border border-zinc-700 bg-[#18181b] px-2 py-0.5 text-[9px] font-bold text-zinc-400">
                              {group.transactions.length} giao dịch
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-bold">
                            {group.income > 0 && <span className="text-emerald-300">Thu +{formatVND(group.income, isAmountsHidden)}</span>}
                            {group.expense > 0 && <span className="text-rose-300">Chi -{formatVND(group.expense, isAmountsHidden)}</span>}
                            {group.transfer > 0 && <span className="text-sky-300">Chuyển {formatVND(group.transfer, isAmountsHidden)}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {group.transactions.map((tx) => {
                  const jar = jars.find((j) => j.id === tx.jarId);
                  const transferToJar = jars.find((j) => j.id === tx.transferToJarId);
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';
                  const isCurrentCycleTransaction = isDateInCycle(
                    tx.date,
                    currentCycleStart,
                    currentCycleEnd,
                  );
                  const referencesArchivedJar = !activeJarIds.includes(tx.jarId) ||
                    Boolean(tx.transferToJarId && !activeJarIds.includes(tx.transferToJarId)) ||
                    Boolean(tx.allocations?.some((allocation) => !activeJarIds.includes(allocation.jarId)));
                  const isPreviousCycleTransaction = isDateInCycle(
                    tx.date,
                    previousCycleStart,
                    currentCycleStart,
                  );
                  const hasValidPreviousSnapshot = tx.type === 'expense'
                    ? backdatableJarIds.has(tx.jarId)
                    : tx.type === 'income' && Boolean(tx.allocations?.length) &&
                      tx.allocations!.every((allocation) => backdatableJarIds.has(allocation.jarId));
                  const canModify = !referencesArchivedJar && (
                    isCurrentCycleTransaction ||
                    (isPreviousCycleTransaction && tx.type !== 'transfer' && hasValidPreviousSnapshot)
                  );
                  const categoryDefinition = tx.type === 'transfer'
                    ? undefined
                    : findTransactionCategory(
                        tx.category,
                        tx.type,
                        jar?.code,
                        customCategories,
                      );
                  const categoryIcon = tx.categoryIcon
                    || (tx.type === 'transfer' ? 'rotate-ccw' : categoryDefinition?.icon)
                    || 'tag';
                  const isCustomCategory = tx.categoryId?.startsWith('custom-') || categoryDefinition?.isCustom;

                      return (
                    <tr key={tx.id} aria-describedby={`transaction-date-${group.date}`} className="hover:bg-[#1c1c20] transition-colors">
                      <td className="p-3.5 font-mono text-zinc-400">{formatDateVI(tx.date)}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-white">{tx.description}</div>
                        <div className="text-[11px] text-zinc-400 flex items-center space-x-1 mt-0.5">
                          <CategoryIcon name={categoryIcon} className="h-3 w-3 text-zinc-500" />
                          <span data-no-translate={isCustomCategory ? 'true' : undefined}>{tx.category}</span>
                        </div>
                        {tx.counterpartyName && <div className="mt-1 text-[10px] text-zinc-500">Đối tác: {tx.counterpartyName}</div>}
                      </td>
                      <td className="p-3.5">
                        {isIncome && tx.allocations?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {tx.allocations.map((allocation) => {
                              const allocatedJar = jars.find((item) => item.id === allocation.jarId);
                              return (
                                <span
                                  key={allocation.jarId}
                                  className="px-2 py-1 rounded-full text-[10px] font-bold text-white"
                                  style={{ backgroundColor: allocatedJar?.color || '#52525b' }}
                                >
                                  {allocatedJar?.code || '?'}: {formatVND(allocation.amount, isAmountsHidden)}
                                </span>
                              );
                            })}
                          </div>
                        ) : isTransfer && (jar || transferToJar) ? (
                          <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
                            <span className="rounded-full px-2 py-1 text-white" style={{ backgroundColor: jar?.color || '#52525b' }}>{jar?.code || '?'}</span>
                            <span className="text-sky-400">→</span>
                            <span className="rounded-full px-2 py-1 text-white" style={{ backgroundColor: transferToJar?.color || '#52525b' }}>{transferToJar?.code || '?'}</span>
                          </div>
                        ) : jar ? (
                          <span
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white inline-block shadow-sm"
                            style={{ backgroundColor: jar.color }}
                          >
                            {jar.code} - {jar.name}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-3.5 font-medium text-zinc-300">
                        {isTransfer && (tx.sourceBankCode || tx.destinationBankCode)
                          ? `${tx.sourceBankCode || '?'} → ${tx.destinationBankCode || '?'}`
                          : tx.bankName || jar?.bankName || '-'}
                      </td>
                      <td className="p-3.5 text-right font-black font-mono text-sm">
                        <span className={isIncome ? 'text-emerald-400' : isTransfer ? 'text-sky-400' : 'text-zinc-100'}>
                          {isIncome ? '+' : isTransfer ? '↔ ' : '-'}{formatVND(tx.amount, isAmountsHidden)}
                        </span>
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditTransaction(tx)}
                            disabled={!canModify}
                            className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-indigo-500/10 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                            title={canModify ? 'Chỉnh sửa giao dịch' : 'Giao dịch này được khóa để bảo toàn dữ liệu chu kỳ'}
                            aria-label={`Chỉnh sửa giao dịch ${tx.description}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTransaction(tx.id)}
                            disabled={!canModify}
                            className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                            title={canModify
                              ? 'Xóa giao dịch'
                              : referencesArchivedJar
                                ? 'Giao dịch thuộc hũ đã lưu trữ và được khóa để bảo toàn tiền đã chuyển'
                                : 'Giao dịch lịch sử này không có đủ snapshot để tính lại an toàn'}
                            aria-label={`Xóa giao dịch ${tx.description}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                      );
                    })}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
