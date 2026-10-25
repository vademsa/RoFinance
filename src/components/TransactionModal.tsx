import React, { useEffect, useState } from 'react';
import { X, Plus, AlertTriangle, AlertCircle, ArrowUpRight, ArrowDownLeft, RefreshCw, Calendar, Tag, Building2 } from 'lucide-react';
import { BankAccount, Jar, MonthlyCycleSummary, Transaction, TransactionCategory } from '../types';
import { isBankOnlyIncome, isBankOnlyExpense } from '../../shared/transactions';
import { formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { CurrencyInput } from './CurrencyInput';
import {
  getFinancialCycleStart,
  getBackdatableJarIds,
  getNextFinancialCycleStart,
  isDateInCycle,
  toLocalDateKey,
} from '../utils/monthlyCycle';
import { getHistoricalSummaryForDate } from '../utils/historicalBalances';
import { getTransactionCategories } from '../constants/categories';
import { CategoryPicker } from './CategoryPicker';
import { CategoryIcon } from './CategoryIcon';
import {
  CASH_PAYMENT_METHOD,
  findPaymentMethodByCode,
  PAYMENT_METHOD_OPTIONS,
} from '../../shared/banks';
import { getDynamicAmountSuggestions } from '../utils/amountSuggestions';
const EMPTY_BANK_ACCOUNTS: BankAccount[] = [];

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jars: Jar[];
  bankAccounts?: BankAccount[];
  onAddTransaction: (newTx: Omit<Transaction, 'id'>) => boolean | void;
  onUpdateTransaction: (id: string, transaction: Omit<Transaction, 'id'>) => boolean | void;
  customCategories: TransactionCategory[];
  onAddCategory: (category: TransactionCategory) => void;
  onUpdateCategory: (category: TransactionCategory) => void;
  initialJarId?: string | null;
  resetDay: number;
  monthlySummaries: MonthlyCycleSummary[];
  initialDate?: string;
  initialType?: 'expense' | 'income';
  editingTransaction?: Transaction | null;
  isAmountsHidden?: boolean;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  jars,
  bankAccounts = EMPTY_BANK_ACCOUNTS,
  onAddTransaction,
  onUpdateTransaction,
  customCategories,
  onAddCategory,
  onUpdateCategory,
  initialJarId,
  resetDay,
  monthlySummaries,
  initialDate,
  initialType = 'expense',
  editingTransaction,
  isAmountsHidden = false,
}) => {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amount, setAmount] = useState<number>(0);
  const [amountError, setAmountError] = useState('');
  const [dateError, setDateError] = useState('');
  const [jarId, setJarId] = useState<string>(jars[0]?.id || '');
  const [categorySelection, setCategorySelection] = useState<Pick<TransactionCategory, 'name' | 'icon'> & { id?: string }>({ name: 'Ăn sáng', icon: 'utensils' });
  const category = categorySelection.name;
  const selectCategory = (next?: TransactionCategory, fallback = 'Khác') => setCategorySelection({ name: next?.name || fallback, id: next?.id, icon: next?.icon || 'tag' });
  const [date, setDate] = useState<string>(toLocalDateKey(new Date()));
  const [description, setDescription] = useState<string>('');
  const [paymentMethodCode, setPaymentMethodCode] = useState<string>(CASH_PAYMENT_METHOD.code);
  const [incomeJarIds, setIncomeJarIds] = useState<string[]>([]);
  const [incomeDestination, setIncomeDestination] = useState<'jars' | 'bank'>('jars');
  const [expenseDestination, setExpenseDestination] = useState<'jar' | 'bank'>('jar');
  const [receivingAccountId, setReceivingAccountId] = useState('');
  const [personalAccountId, setPersonalAccountId] = useState('CASH');
  const [transferToJarId, setTransferToJarId] = useState<string>(jars[1]?.id || '');

  useEffect(() => {
    if (!isOpen) return;
    const nextType = editingTransaction?.type || initialType;
    setType(nextType);
    setIncomeDestination(editingTransaction && isBankOnlyIncome(editingTransaction) ? 'bank' : 'jars');
    setExpenseDestination(editingTransaction && isBankOnlyExpense(editingTransaction) ? 'bank' : 'jar');
    setReceivingAccountId(editingTransaction?.bankAccountId || bankAccounts[0]?.id || '');
    setPersonalAccountId(editingTransaction?.bankAccountId || (editingTransaction && editingTransaction.paymentMethodCode !== 'CASH' ? 'LEGACY' : 'CASH'));
    setAmount(editingTransaction?.amount || 0);
    setAmountError('');
    setDateError('');
    const nextDate = editingTransaction?.date || initialDate || toLocalDateKey(new Date());
    setDate(nextDate);
    setDescription(editingTransaction?.description || '');
    const isHistoricalDate = nextDate < toLocalDateKey(getFinancialCycleStart(new Date(), resetDay));
    const eligibleIds = isHistoricalDate
      ? getBackdatableJarIds(getHistoricalSummaryForDate(monthlySummaries, nextDate, resetDay))
      : new Set(jars.map((jar) => jar.id));
    const eligibleJars = jars.filter((jar) => eligibleIds.has(jar.id));
    const initialJar = eligibleJars.find((jar) => jar.id === editingTransaction?.jarId)
      || eligibleJars.find((jar) => jar.id === initialJarId)
      || eligibleJars[0];
    setJarId(initialJar?.id || '');
    setPaymentMethodCode(
      findPaymentMethodByCode(editingTransaction?.paymentMethodCode)?.code
      || findPaymentMethodByCode(initialJar?.bankCode)?.code
      || CASH_PAYMENT_METHOD.code
    );
    const editableAllocationIds = editingTransaction?.allocations
      ?.map((allocation) => allocation.jarId)
      .filter((id) => eligibleIds.has(id));
    setIncomeJarIds(editableAllocationIds?.length ? editableAllocationIds : initialJar ? [initialJar.id] : []);
    const destination = jars.find((jar) => jar.id === editingTransaction?.transferToJarId)
      || jars.find((jar) => jar.id !== initialJar?.id);
    if (destination) setTransferToJarId(destination.id);
    const initialCategories = getTransactionCategories(
      nextType === 'income' ? 'income' : 'expense',
      initialJar?.code,
      customCategories,
    );
    const initialCategory = editingTransaction
      ? initialCategories.find(category => category.id === editingTransaction.categoryId)
        || initialCategories.find(category => category.name === editingTransaction.category)
      : initialCategories[0];
    setCategorySelection({ name: editingTransaction?.category || initialCategory?.name || 'Khác',
      id: editingTransaction?.categoryId || initialCategory?.id,
      icon: editingTransaction?.categoryIcon || initialCategory?.icon || 'tag' });
  }, [editingTransaction, initialJarId, initialDate, initialType, isOpen, jars, monthlySummaries, resetDay, bankAccounts]);

  if (!isOpen) return null;

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const currentCycleStart = getFinancialCycleStart(now, resetDay);
  const currentCycleEnd = getNextFinancialCycleStart(currentCycleStart, resetDay);
  const isPreviousCycleDate = type !== 'transfer' && Boolean(date && date < toLocalDateKey(currentCycleStart));
  const historicalSummary = isPreviousCycleDate ? getHistoricalSummaryForDate(monthlySummaries, date, resetDay) : undefined;
  const previousCycleJarIds = getBackdatableJarIds(historicalSummary);
  const previousCycleJars = jars.filter((jar) => previousCycleJarIds.has(jar.id));
  const canBackdateTransaction = Boolean(historicalSummary && previousCycleJars.length > 0);
  const expenseJars = isPreviousCycleDate ? previousCycleJars : jars;
  const incomeJars = isPreviousCycleDate ? previousCycleJars : jars;
  const selectableJars = type === 'expense' ? expenseJars : type === 'income' ? incomeJars : jars;
  const selectedJar = selectableJars.find((j) => j.id === jarId) || selectableJars[0];
  const selectedDestinationJar = jars.find((j) => j.id === transferToJarId);
  const bankOnly = type === 'income' && incomeDestination === 'bank';
  const bankOnlyExpense = type === 'expense' && expenseDestination === 'bank';
  const receivingAccount = bankAccounts.find((account) => account.id === receivingAccountId);
  const personalAccount = bankAccounts.find(account => account.id === personalAccountId);
  const categories = getTransactionCategories(
    type === 'income' ? 'income' : 'expense',
    bankOnly || bankOnlyExpense ? undefined : selectedJar?.code,
    customCategories,
  );
  const selectedPaymentMethod = bankOnly || bankOnlyExpense
    ? findPaymentMethodByCode(receivingAccount?.bankCode) || CASH_PAYMENT_METHOD
    : type === 'transfer'
    ? findPaymentMethodByCode(selectedJar?.bankCode) || CASH_PAYMENT_METHOD
    : personalAccount ? findPaymentMethodByCode(personalAccount.bankCode) || CASH_PAYMENT_METHOD
    : personalAccountId === 'LEGACY' ? findPaymentMethodByCode(paymentMethodCode) || CASH_PAYMENT_METHOD : CASH_PAYMENT_METHOD;

  // Budget alert simulation before submission
  const projectedSpent = (selectedJar?.currentSpent || 0) + (type === 'expense' && !bankOnlyExpense ? amount : 0);
  const projectedPercentage = selectedJar?.targetBudget > 0 ? (projectedSpent / selectedJar.targetBudget) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setAmountError('Vui lòng nhập số tiền lớn hơn 0.');
      return;
    }
    const belongsToCurrentCycle = isDateInCycle(date, currentCycleStart, currentCycleEnd);
    const belongsToPreviousCycle = date < toLocalDateKey(currentCycleStart);
    const allowedDate = date <= todayKey && (
      belongsToCurrentCycle ||
      (type !== 'transfer' && (bankOnly || bankOnlyExpense || canBackdateTransaction) && belongsToPreviousCycle)
    );
    if (!allowedDate) {
      setDateError(type === 'transfer'
        ? 'Chuyển hũ chỉ được ghi trong chu kỳ hiện tại.'
        : 'Chu kỳ cũ cần có số dư đầu kỳ của hũ trước khi ghi thu hoặc chi.');
      return;
    }
    if ((bankOnly || bankOnlyExpense) && !receivingAccount) {
      setDateError('Hãy chọn một tài khoản ngân hàng đã lưu.');
      return;
    }
    if (!bankOnly && !bankOnlyExpense && type !== 'transfer' && !['CASH', 'LEGACY'].includes(personalAccountId) && !personalAccount) {
      setDateError('Hãy chọn một tài khoản ngân hàng đã lưu.'); return;
    }
    const invalidPreviousIncomeAllocation = type === 'income' && !bankOnly && belongsToPreviousCycle && (
      incomeJarIds.length === 0 || incomeJarIds.some((id) => !previousCycleJarIds.has(id))
    );
    if ((!bankOnly && !bankOnlyExpense && !selectedJar) ||
      (type === 'expense' && !bankOnlyExpense && belongsToPreviousCycle && !previousCycleJarIds.has(selectedJar!.id)) ||
      invalidPreviousIncomeAllocation) {
      setDateError('Hũ này không tồn tại trong dữ liệu tổng kết của chu kỳ đã chọn.');
      return;
    }
    if (type === 'transfer' && (!selectedDestinationJar || selectedDestinationJar.id === selectedJar?.id)) return;

    const preserveExistingAllocations = type === 'income' &&
      editingTransaction?.type === 'income' &&
      editingTransaction.amount === amount &&
      editingTransaction.allocations?.length === incomeJarIds.length &&
      editingTransaction.allocations.every((allocation, index) => (
        allocation.jarId === incomeJarIds[index]
      ));
    const incomeAllocations = type === 'income' && !bankOnly
      ? preserveExistingAllocations
        ? editingTransaction.allocations?.map((allocation) => ({ ...allocation }))
        : incomeJarIds.map((selectedJarId, index) => {
            const baseAmount = Math.floor(amount / incomeJarIds.length);
            return {
              jarId: selectedJarId,
              amount:
                index === incomeJarIds.length - 1
                  ? amount - baseAmount * (incomeJarIds.length - 1)
                  : baseAmount,
            };
          })
      : undefined;
    const transactionData: Omit<Transaction, 'id'> = {
      type,
      amount,
      jarId: (bankOnly || bankOnlyExpense) ? '' : type === 'income' ? (incomeJarIds[0] || jarId) : jarId,
      bankAccountId: type === 'transfer' ? undefined : (bankOnly || bankOnlyExpense) ? receivingAccount?.id : personalAccount?.id,
      category: type === 'transfer' ? 'Chuyển khoản nội bộ' : category,
      categoryId: type === 'transfer' ? undefined : categorySelection.id,
      categoryIcon: type === 'transfer' ? 'rotate-ccw' : categorySelection.icon,
      date,
      description: description || (type === 'expense'
        ? (bankOnlyExpense ? 'Chi tiêu tài khoản ngân hàng' : 'Chi tiêu cá nhân')
        : type === 'income' ? 'Thu nhập bổ sung' : `Chuyển từ ${selectedJar?.name} sang ${selectedDestinationJar?.name}`),
      paymentMethodCode: selectedPaymentMethod.code,
      bankName: selectedPaymentMethod.shortName,
      transferToJarId: type === 'transfer' ? selectedDestinationJar?.id : undefined,
      sourceAccountNumber: editingTransaction?.bankTransactionId
        ? editingTransaction.sourceAccountNumber
        : type === 'transfer' ? selectedJar?.accountNumber : undefined,
      bankTransactionId: editingTransaction?.bankTransactionId,
      recipientAccount: type === 'transfer' ? selectedDestinationJar?.accountNumber : undefined,
      sourceBankCode: type === 'transfer' ? selectedJar?.bankCode : undefined,
      destinationBankCode: type === 'transfer' ? selectedDestinationJar?.bankCode : undefined,
      allocations: incomeAllocations,
    };
    const wasSaved = editingTransaction
      ? onUpdateTransaction(editingTransaction.id, transactionData)
      : onAddTransaction(transactionData);
    if (wasSaved === false) return;

    // Reset form
    setAmount(0);
    setAmountError('');
    setDescription('');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onClose();
  };

  const handleSuggestedAmount = (suggestedAmount: number) => {
    setAmountError('');
    setAmount(suggestedAmount);
  };

  const amountSuggestions = getDynamicAmountSuggestions(amount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="transaction-modal-title" className="bg-[#18181b] rounded-[32px] shadow-2xl max-w-lg w-full overflow-hidden border border-zinc-800 my-8 text-zinc-100">
        {/* Header */}
        <div className="bg-[#121214] text-white p-5 flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
              <Plus className="w-5 h-5" />
            </div>
            <h2 id="transaction-modal-title" className="text-lg font-black tracking-tight">
              {editingTransaction ? 'Chỉnh Sửa Giao Dịch' : 'Thêm Giao Dịch Mới'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Type Selector Tabs */}
          <div className="grid grid-cols-3 gap-2 bg-[#121214] p-1.5 rounded-2xl border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setType('expense');
                setDateError('');
                setExpenseDestination('jar');
                if (isPreviousCycleDate && !previousCycleJarIds.has(jarId) && previousCycleJars[0]) {
                  setJarId(previousCycleJars[0].id);
                }
                const expenseCategories = getTransactionCategories('expense', selectedJar?.code, customCategories);
                selectCategory(expenseCategories[0]);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                type === 'expense'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Chi Tiêu</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType('income');
                setDateError('');
                if (isPreviousCycleDate) {
                  const retainedIds = incomeJarIds.filter((id) => previousCycleJarIds.has(id));
                  const nextIds = retainedIds.length
                    ? retainedIds
                    : previousCycleJars[0]
                      ? [previousCycleJars[0].id]
                      : [];
                  setIncomeJarIds(nextIds);
                  if (!previousCycleJarIds.has(jarId) && nextIds[0]) setJarId(nextIds[0]);
                }
                selectCategory(getTransactionCategories('income', undefined, customCategories)[0], 'Thu nhập khác');
                if (incomeJarIds.length === 0 && selectedJar) setIncomeJarIds([selectedJar.id]);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                type === 'income'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Thu Nhập</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType('transfer');
                if (date < toLocalDateKey(currentCycleStart)) setDate(todayKey);
                setDateError('');
                selectCategory(undefined, 'Chuyển khoản nội bộ');
                setPaymentMethodCode(findPaymentMethodByCode(selectedJar?.bankCode)?.code || CASH_PAYMENT_METHOD.code);
                if (!transferToJarId || transferToJarId === selectedJar?.id) {
                  setTransferToJarId(jars.find((jar) => jar.id !== selectedJar?.id)?.id || '');
                }
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                type === 'transfer'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Chuyển Hũ</span>
            </button>
          </div>

          {/* Amount Field */}
          <div className="space-y-2">
            <label htmlFor="transaction-amount" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Số Tiền ({getDisplayCurrencyCode()})
            </label>
            <div className="relative">
              <CurrencyInput
                id="transaction-amount"
                value={amount}
                hideAmount={isAmountsHidden}
                onValueChange={(value) => {
                  setAmount(value === '' ? 0 : value);
                  setAmountError('');
                }}
                placeholder="0"
                required
                min={1000}
                className={`w-full pl-4 pr-16 py-3.5 text-2xl font-black font-mono text-white bg-[#121214] border rounded-2xl focus:outline-none transition-all ${amountError ? 'border-rose-500 focus:border-rose-400' : 'border-zinc-700 focus:border-indigo-500'}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400">
                {getDisplayCurrencyCode()}
              </span>
            </div>

            {amountError && <p role="alert" className="text-[11px] font-semibold text-rose-400">{amountError}</p>}

            {!isAmountsHidden && amountSuggestions.length > 0 && (
              <div className="pt-1" aria-label="Gợi ý số tiền theo giá trị đang nhập">
                <div className="mb-1.5 text-[10px] font-semibold text-zinc-500">Gợi ý theo số đang nhập</div>
                <div className="flex flex-wrap gap-1.5">
                  {amountSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSuggestedAmount(suggestion)}
                      className={`cursor-pointer rounded-xl border px-2.5 py-1 font-mono text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                        amount === suggestion
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                          : 'border-zinc-800 bg-[#1c1c20] text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {formatVND(suggestion, isAmountsHidden)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Jar / Bank Selection */}
          {type === 'income' ? (
            <div className="space-y-2">
              <label htmlFor="income-destination" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Cách nhận tiền</label>
              <select id="income-destination" value={incomeDestination} onChange={(event) => {
                setIncomeDestination(event.target.value as 'jars' | 'bank'); setDateError('');
              }} className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-semibold text-xs text-white focus:outline-none focus:border-indigo-500">
                <option value="jars">Phân bổ khoản thu vào các hũ</option>
                <option value="bank">Nhận vào tài khoản, không phân bổ hũ</option>
              </select>
              {bankOnly ? <div className="space-y-2">
                <label htmlFor="income-bank-account" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Tài khoản ngân hàng nhận tiền</label>
                <select id="income-bank-account" value={receivingAccountId} onChange={(event) => { setReceivingAccountId(event.target.value); setDateError(''); }} required
                  className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-semibold text-xs text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Chọn tài khoản đã lưu</option>
                  {bankAccounts.map((account) => <option data-no-translate="true" key={account.id} value={account.id}>{account.bankName} · {account.accountNumber} · {account.accountHolder}</option>)}
                </select>
                <p className="text-xs text-zinc-400">Tiền chỉ cộng vào tài khoản đã chọn. Số dư và tỷ lệ các hũ không thay đổi.</p>
                {bankAccounts.length === 0 && <p role="status" className="text-xs text-amber-400">Chưa có tài khoản ngân hàng. Hãy thêm tài khoản trong mục Ngân hàng trước.</p>}
              </div> : <>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Phân bổ khoản thu vào các hũ
              </label>
              <div className="grid grid-cols-2 gap-2">
                {incomeJars.map((jar) => {
                  const selected = incomeJarIds.includes(jar.id);
                  const allocation = selected
                    ? Math.floor(amount / Math.max(1, incomeJarIds.length))
                    : 0;
                  return (
                    <button
                      key={jar.id}
                      type="button"
                      onClick={() =>
                        setIncomeJarIds((current) =>
                          selected
                            ? current.length > 1
                              ? current.filter((id) => id !== jar.id)
                              : current
                            : [...current, jar.id]
                        )
                      }
                      className={`p-2.5 rounded-xl border text-left ${
                        selected
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-zinc-800 bg-[#121214] text-zinc-500'
                      }`}
                    >
                      <span className="block text-xs font-bold text-white">{jar.name}</span>
                      <span className="block mt-1 text-[10px] font-mono text-emerald-400">
                        {selected ? formatVND(allocation, isAmountsHidden) : 'Không phân bổ'}
                      </span>
                    </button>
                  );
                })}
              </div>
              </> }
            </div>
          ) : type === 'transfer' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Từ hũ</label>
                <select value={jarId} onChange={(event) => {
                  const sourceId = event.target.value;
                  setJarId(sourceId);
                  const source = jars.find((jar) => jar.id === sourceId);
                  if (source) setPaymentMethodCode(findPaymentMethodByCode(source.bankCode)?.code || CASH_PAYMENT_METHOD.code);
                  if (transferToJarId === sourceId) setTransferToJarId(jars.find((jar) => jar.id !== sourceId)?.id || '');
                }} className="w-full rounded-2xl border border-zinc-700 bg-[#121214] p-3 text-xs font-bold text-white outline-none focus:border-indigo-500">
                  {jars.map((jar) => <option key={jar.id} value={jar.id}>{jar.name} ({jar.code})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Đến hũ</label>
                <select value={transferToJarId} onChange={(event) => setTransferToJarId(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-[#121214] p-3 text-xs font-bold text-white outline-none focus:border-indigo-500">
                  {jars.filter((jar) => jar.id !== jarId).map((jar) => <option key={jar.id} value={jar.id}>{jar.name} ({jar.code})</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">Đây là điều chuyển hạn mức giữa hai hũ, không phải chuyển tiền ngân hàng.</div>
            </div>
          ) : (
          <div className="space-y-2">
            <label htmlFor="expense-destination" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Ghi chi tiêu vào</label>
            <select
              id="expense-destination"
              value={expenseDestination}
              onChange={(event) => {
                setExpenseDestination(event.target.value as 'jar' | 'bank');
                setDateError('');
                if (event.target.value === 'bank') {
                  setReceivingAccountId(bankAccounts[0]?.id || '');
                }
              }}
              className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-semibold text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="jar">Hũ tài chính</option>
              <option value="bank">Tài khoản ngân hàng (không qua hũ)</option>
            </select>
            {bankOnlyExpense ? (
              <div className="space-y-2">
                <label htmlFor="expense-bank-account" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Tài khoản ngân hàng chi tiêu</label>
                <select
                  id="expense-bank-account"
                  value={receivingAccountId}
                  onChange={(event) => { setReceivingAccountId(event.target.value); setDateError(''); }}
                  required
                  className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-semibold text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Chọn tài khoản đã lưu</option>
                  {bankAccounts.map((account) => (
                    <option data-no-translate="true" key={account.id} value={account.id}>
                      {account.bankName} · {account.accountNumber} · {account.accountHolder}
                    </option>
                  ))}
                </select>
                <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-200">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Chi tiêu này được ghi nhận vào tài khoản ngân hàng. Số dư hũ tài chính <strong>không thay đổi</strong> và giao dịch sẽ được thống kê riêng.</span>
                </div>
                {bankAccounts.length === 0 && <p role="status" className="text-xs text-amber-400">Chưa có tài khoản ngân hàng. Hãy thêm tài khoản trong mục Ngân hàng trước.</p>}
              </div>
            ) : (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Hũ Tài Chính Liên Kết
              </label>
              <select
                value={jarId}
                onChange={(e) => {
                  setJarId(e.target.value);
                  const newJar = jars.find((j) => j.id === e.target.value);
                  if (newJar) {
                    setPaymentMethodCode(findPaymentMethodByCode(newJar.bankCode)?.code || CASH_PAYMENT_METHOD.code);
                  }
                }}
                className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-bold text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {expenseJars.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} ({j.code}) - Hạn mức {formatVND(j.targetBudget, isAmountsHidden)}
                  </option>
                ))}
              </select>
            </div>
            )}
          </div>
          )}

          {/* Live Warning Banner if Expense > 80% or > 100% */}
          {type === 'expense' && !bankOnlyExpense && !isPreviousCycleDate && selectedJar?.code === 'NEC' && projectedPercentage >= 80 && (
            <div
              className={`p-3.5 rounded-2xl border flex items-start space-x-2.5 text-xs ${
                projectedPercentage > 100
                  ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
                  : 'bg-amber-950/30 border-amber-500/50 text-amber-200'
              }`}
            >
              {projectedPercentage > 100 ? (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  {projectedPercentage > 100
                    ? 'CẢNH BÁO: Giao dịch này sẽ vượt quá hạn mức hũ!'
                    : 'Nhắc nhở: Hũ này đã sử dụng hơn 80% hạn mức tháng'}
                </div>
                <div className="mt-0.5 opacity-90 font-mono">
                  Dự kiến tổng chi: {formatVND(projectedSpent, isAmountsHidden)} / Hạn mức: {formatVND(selectedJar?.targetBudget || 0, isAmountsHidden)} (
                  {projectedPercentage.toFixed(1)}%)
                </div>
              </div>
            </div>
          )}

          {/* Category & Bank Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Danh Mục</label>
              {type === 'transfer' ? (
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-[#121214] p-3 text-xs font-semibold text-zinc-300">
                  <CategoryIcon name="rotate-ccw" className="h-4 w-4 text-indigo-300" />
                  Chuyển khoản nội bộ
                </div>
              ) : (
                <CategoryPicker
                  key={type}
                  categories={categories}
                  customCategories={customCategories}
                  value={category}
                  valueId={categorySelection.id}
                  valueIcon={categorySelection.icon}
                  type={type}
                  onChange={selectCategory}
                  onAddCategory={onAddCategory}
                  onUpdateCategory={onUpdateCategory}
                />
              )}
            </div>

            {!bankOnly && !bankOnlyExpense && <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="transaction-payment-method" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Tài khoản thực nhận / chi tiền
              </label>
              <select
                id="transaction-payment-method"
                value={type === 'transfer' ? selectedPaymentMethod.code : personalAccountId}
                onChange={(event) => setPersonalAccountId(event.target.value)}
                disabled={type === 'transfer'}
                className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-semibold text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {type !== 'transfer' ? <>
                  <option value="CASH">Tiền mặt · không tác động tài khoản ngân hàng</option>
                  {editingTransaction && personalAccountId === 'LEGACY' && <option value="LEGACY">Giao dịch cũ · chưa xác định tài khoản</option>}
                  {bankAccounts.map(account => <option data-no-translate="true" key={account.id} value={account.id}>{account.bankName} · {account.accountNumber}</option>)}
                </> : PAYMENT_METHOD_OPTIONS.map((method) => (
                  <option key={method.code} value={method.code}>
                    {method.code === CASH_PAYMENT_METHOD.code
                      ? method.shortName
                      : `${method.shortName} (${method.code})`}
                  </option>
                ))}
              </select>
              {type !== 'transfer' && <p className="text-[10px] text-zinc-400">Hũ chỉ theo dõi hạn mức. Tài khoản được chọn mới ghi nhận dòng tiền thực tế.</p>}
              {type === 'transfer' && (
                <p className="text-[10px] text-zinc-500">
                  Phương thức được lấy tự động từ ngân hàng của hũ nguồn.
                </p>
              )}
            </div>}
          </div>

          {/* Date & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="transaction-date" className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Ngày Giao Dịch
              </label>
              <input
                id="transaction-date"
                type="date"
                value={date}
                min={type === 'transfer' ? toLocalDateKey(currentCycleStart) : undefined}
                max={todayKey}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setDate(nextDate);
                  setDateError('');
                  const nextIsPreviousCycle = type !== 'transfer' && nextDate < toLocalDateKey(currentCycleStart);
                  const nextIds = getBackdatableJarIds(nextIsPreviousCycle
                    ? getHistoricalSummaryForDate(monthlySummaries, nextDate, resetDay) : undefined);
                  const nextJars = nextIsPreviousCycle ? jars.filter((jar) => nextIds.has(jar.id)) : jars;
                  if (type === 'income') {
                    const retainedIds = incomeJarIds.filter((id) => nextJars.some((jar) => jar.id === id));
                    setIncomeJarIds(retainedIds.length ? retainedIds : nextJars[0] ? [nextJars[0].id] : []);
                  }
                  if (!nextJars.some((jar) => jar.id === jarId) && nextJars[0]) {
                    const nextJar = nextJars[0];
                    setJarId(nextJar.id);
                    setPaymentMethodCode(findPaymentMethodByCode(nextJar.bankCode)?.code || CASH_PAYMENT_METHOD.code);
                  }
                }}
                aria-invalid={Boolean(dateError)}
                className={`w-full p-3 bg-[#121214] border rounded-2xl font-medium text-xs text-white focus:outline-none ${dateError ? 'border-rose-500 focus:border-rose-400' : 'border-zinc-700 focus:border-indigo-500'}`}
              />
              {dateError && <p role="alert" className="text-[11px] font-semibold text-rose-400">{dateError}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Ghi Chú Nội Dung
              </label>
              <input
                type="text"
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Cà phê sáng cùng khách hàng"
                className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-medium text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {isPreviousCycleDate && !bankOnly && !bankOnlyExpense && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {canBackdateTransaction
                  ? `Đang ghi ${type === 'income' ? 'khoản thu' : 'khoản chi'} cho chu kỳ cũ. Số dư sẽ được tính lại qua các chu kỳ có dữ liệu liên tục.`
                  : 'Chu kỳ này chưa có số dư hũ đầu kỳ. Hãy đối soát số dư ở mục Giao dịch trước khi ghi.'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 font-bold text-xs hover:bg-zinc-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={(bankOnly || bankOnlyExpense) && !receivingAccount}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingTransaction ? 'Lưu Thay Đổi' : 'Lưu Giao Dịch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
