import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Building2,
  CalendarDays,
  Edit2,
  Landmark,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type { SafetyInvestment } from '../types';
import { formatDateVI, formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { CurrencyInput } from './CurrencyInput';
import { toLocalDateKey } from '../utils/monthlyCycle';
import {
  addSafetyInvestmentWithdrawal,
  calculateSafetyInvestmentReturn,
  getSafetyInvestmentRemaining,
  getSafetyInvestmentWithdrawn,
} from '../utils/safetyInvestments';

const today = () => toLocalDateKey(new Date());
const oneYearFromToday = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return toLocalDateKey(date);
};

interface SafetyInvestmentPortfolioProps {
  investments: SafetyInvestment[];
  onAddInvestment: (investment: Omit<SafetyInvestment, 'id'>) => void;
  onUpdateInvestment: (investment: SafetyInvestment) => void;
  onDeleteInvestment: (id: string) => void;
  isAmountsHidden: boolean;
}

export const SafetyInvestmentPortfolio: React.FC<SafetyInvestmentPortfolioProps> = ({
  investments,
  onAddInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  isAmountsHidden,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<SafetyInvestment | null>(null);
  const [providerType, setProviderType] = useState<SafetyInvestment['providerType']>('tikop');
  const [providerName, setProviderName] = useState('Tikop');
  const [productName, setProductName] = useState('Tích lũy linh hoạt');
  const [principalAmount, setPrincipalAmount] = useState<number | ''>('');
  const [annualInterestRate, setAnnualInterestRate] = useState<number | ''>('');
  const [startDate, setStartDate] = useState(today);
  const [maturityDate, setMaturityDate] = useState(oneYearFromToday);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [withdrawingInvestment, setWithdrawingInvestment] = useState<SafetyInvestment | null>(null);
  const [withdrawalAmount, setWithdrawalAmount] = useState<number | ''>('');
  const [withdrawalDate, setWithdrawalDate] = useState(today);
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [withdrawalError, setWithdrawalError] = useState('');
  useEffect(() => {
    if (withdrawingInvestment) {
      document.getElementById('safety-withdrawal-amount')?.focus();
    }
  }, [withdrawingInvestment]);

  const totals = useMemo(
    () =>
      investments.reduce(
        (result, investment) => {
          const calculated = calculateSafetyInvestmentReturn(investment);
          result.principal += calculated.remainingPrincipal;
          result.interest += calculated.expectedInterest;
          result.maturity += calculated.maturityValue;
          return result;
        },
        { principal: 0, interest: 0, maturity: 0 }
      ),
    [investments]
  );

  const resetForm = () => {
    setEditingInvestment(null);
    setProviderType('tikop');
    setProviderName('Tikop');
    setProductName('Tích lũy linh hoạt');
    setPrincipalAmount('');
    setAnnualInterestRate('');
    setStartDate(today());
    setMaturityDate(oneYearFromToday());
    setNotes('');
    setFormError('');
  };

  const openAddForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (investment: SafetyInvestment) => {
    setEditingInvestment(investment);
    setProviderType(investment.providerType);
    setProviderName(investment.providerName);
    setProductName(investment.productName);
    setPrincipalAmount(investment.principalAmount);
    setAnnualInterestRate(investment.annualInterestRate);
    setStartDate(investment.startDate);
    setMaturityDate(investment.maturityDate);
    setNotes(investment.notes || '');
    setFormError('');
    setIsFormOpen(true);
  };

  const openWithdrawalForm = (investment: SafetyInvestment) => {
    setWithdrawingInvestment(investment);
    setWithdrawalAmount('');
    setWithdrawalDate(today());
    setWithdrawalNotes('');
    setWithdrawalError('');
  };

  const closeWithdrawalForm = () => {
    setWithdrawingInvestment(null);
    setWithdrawalAmount('');
    setWithdrawalNotes('');
    setWithdrawalError('');
  };

  const handleWithdrawal = (event: React.FormEvent) => {
    event.preventDefault();
    if (!withdrawingInvestment) return;
    const amount = withdrawalAmount === '' ? 0 : withdrawalAmount;
    if (withdrawalDate > today()) {
      setWithdrawalError('Ngày rút không được nằm trong tương lai.');
      return;
    }
    try {
      const updated = addSafetyInvestmentWithdrawal(withdrawingInvestment, {
        id: `safe-withdrawal-${Date.now()}`,
        amount,
        date: withdrawalDate,
        notes: withdrawalNotes.trim(),
        createdAt: new Date().toISOString(),
      });
      onUpdateInvestment(updated);
      closeWithdrawalForm();
    } catch (error) {
      setWithdrawalError(error instanceof Error ? error.message : 'Không thể ghi nhận khoản rút.');
    }
  };

  const handleProviderTypeChange = (value: SafetyInvestment['providerType']) => {
    setProviderType(value);
    if (value === 'tikop') setProviderName('Tikop');
    if (value === 'bank') setProviderName('');
    if (value === 'other') setProviderName('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const principal = principalAmount === '' ? 0 : principalAmount;
    const interestRate = annualInterestRate === '' ? 0 : annualInterestRate;
    if (!providerName.trim() || !productName.trim() || principal <= 0) {
      setFormError('Vui lòng nhập đơn vị gửi, sản phẩm và số tiền hợp lệ.');
      return;
    }
    if (!startDate || !maturityDate || maturityDate < startDate || interestRate < 0) {
      setFormError('Kỳ hạn hoặc lãi suất chưa hợp lệ.');
      return;
    }
    if (editingInvestment && principal < getSafetyInvestmentWithdrawn(editingInvestment)) {
      setFormError('Tiền gốc không được nhỏ hơn tổng số tiền đã rút.');
      return;
    }
    const value: Omit<SafetyInvestment, 'id'> = {
      providerType,
      providerName: providerName.trim(),
      productName: productName.trim(),
      principalAmount: principal,
      annualInterestRate: interestRate,
      startDate,
      maturityDate,
      notes: notes.trim(),
      withdrawals: editingInvestment?.withdrawals || [],
    };
    if (editingInvestment) {
      onUpdateInvestment({ ...value, id: editingInvestment.id });
    } else {
      onAddInvestment(value);
    }
    setIsFormOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-zinc-800 bg-[#121214] p-5 shadow-2xl sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Quỹ An Toàn Sinh Lãi</h2>
              <p className="mt-1 text-xs text-zinc-400">
                Theo dõi tiền gửi tại Tikop, ngân hàng hoặc nền tảng tích lũy an toàn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddForm}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 transition-colors hover:bg-cyan-500"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm Khoản Gửi</span>
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="Tổng vốn còn lại" value={formatVND(totals.principal, isAmountsHidden)} />
          <SummaryCard
            label="Lãi dự kiến"
            value={formatVND(totals.interest, isAmountsHidden)}
            tone="emerald"
          />
          <SummaryCard
            label="Giá trị khi đáo hạn"
            value={formatVND(totals.maturity, isAmountsHidden)}
            tone="cyan"
          />
        </div>
      </section>

      {investments.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-zinc-700 bg-[#121214] px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-cyan-400" />
          <h3 className="mt-3 text-sm font-black text-white">Chưa có khoản gửi an toàn</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-400">
            Thêm khoản gửi Tikop hoặc tiền gửi ngân hàng để theo dõi kỳ hạn và lãi dự kiến.
          </p>
          <button
            type="button"
            onClick={openAddForm}
            className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20"
          >
            Thêm Khoản Gửi Đầu Tiên
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {investments.map((investment) => {
            const calculated = calculateSafetyInvestmentReturn(investment);
            const isMatured = investment.maturityDate < today();
            const withdrawnAmount = getSafetyInvestmentWithdrawn(investment);
            const isFullyWithdrawn = calculated.remainingPrincipal <= 0;
            return (
              <article
                key={investment.id}
                className="rounded-[24px] border border-zinc-800 bg-[#121214] p-5 shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                      {investment.providerType === 'tikop' ? (
                        <Smartphone className="h-5 w-5" />
                      ) : investment.providerType === 'bank' ? (
                        <Landmark className="h-5 w-5" />
                      ) : (
                        <Building2 className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3
                        data-no-translate="true"
                        className="truncate text-sm font-black text-white"
                      >
                        {investment.productName}
                      </h3>
                      <p
                        data-no-translate="true"
                        className="truncate text-xs text-zinc-400"
                      >
                        {investment.providerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditForm(investment)}
                      aria-label="Sửa khoản gửi"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteInvestment(investment.id)}
                      aria-label="Xóa khoản gửi"
                      className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="Vốn còn lại" value={formatVND(calculated.remainingPrincipal, isAmountsHidden)} />
                  <Metric label="Lãi suất năm" value={`${investment.annualInterestRate}%`} />
                  <Metric label="Lãi dự kiến" value={formatVND(calculated.expectedInterest, isAmountsHidden)} tone="emerald" />
                  <Metric label="Khi đáo hạn" value={formatVND(calculated.maturityValue, isAmountsHidden)} tone="cyan" />
                </div>
                {withdrawnAmount > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-bold text-amber-300">Đã rút</span>
                      <span className="font-mono font-black text-amber-200">{formatVND(withdrawnAmount, isAmountsHidden)}</span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {[...(investment.withdrawals || [])]
                        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
                        .slice(0, 3)
                        .map((withdrawal) => (
                          <div key={withdrawal.id} className="flex items-center justify-between gap-3 text-[10px] text-zinc-400">
                            <span>{formatDateVI(withdrawal.date)}{withdrawal.notes ? ` · ${withdrawal.notes}` : ''}</span>
                            <span className="shrink-0 font-mono text-amber-300">-{formatVND(withdrawal.amount, isAmountsHidden)}</span>
                          </div>
                        ))}
                    </div>
                    {(investment.withdrawals?.length || 0) > 3 && (
                      <div className="mt-2 text-[10px] font-semibold text-zinc-500">
                        +{(investment.withdrawals?.length || 0) - 3} lần rút trước đó
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateVI(investment.startDate)} → {formatDateVI(investment.maturityDate)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 font-bold ${
                      isFullyWithdrawn
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : isMatured
                        ? 'border-zinc-700 bg-zinc-800 text-zinc-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {isFullyWithdrawn ? 'Đã rút hết' : isMatured ? 'Đã đáo hạn' : `${calculated.durationDays} ngày`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openWithdrawalForm(investment)}
                  disabled={isFullyWithdrawn}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  <span>{isFullyWithdrawn ? 'Khoản gửi đã rút hết' : 'Rút tiền'}</span>
                </button>
              </article>
            );
          })}
        </section>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md">
          <form
            onSubmit={handleSubmit}
            className="my-4 w-full max-w-xl overflow-hidden rounded-[28px] border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 bg-[#121214] px-5 py-4">
              <div>
                <h3 className="text-base font-black text-white">
                  {editingInvestment ? 'Chỉnh Sửa Khoản Gửi' : 'Thêm Khoản Gửi An Toàn'}
                </h3>
                <p className="mt-0.5 text-[11px] text-zinc-400">Liên kết với hũ Quỹ an toàn (SAFE)</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Đóng"
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto p-5">
              {formError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">
                  {formError}
                </div>
              )}
              <div>
                <label className="mb-2 block text-xs font-bold text-zinc-300">Nơi gửi tiền</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['tikop', 'Tikop'],
                    ['bank', 'Ngân hàng'],
                    ['other', 'Khác'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleProviderTypeChange(value)}
                      className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${
                        providerType === value
                          ? 'border-cyan-500 bg-cyan-600 text-white'
                          : 'border-zinc-700 bg-[#121214] text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Tên đơn vị / ngân hàng">
                  <input
                    value={providerName}
                    onChange={(event) => setProviderName(event.target.value)}
                    placeholder="VD: Tikop, Techcombank"
                    className="form-input"
                  />
                </FormField>
                <FormField label="Tên sản phẩm">
                  <input
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="VD: Tích lũy linh hoạt"
                    className="form-input"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={`Số tiền gửi (${getDisplayCurrencyCode()})`}>
                  <CurrencyInput
                    value={principalAmount}
                    onValueChange={setPrincipalAmount}
                    min={0}
                    placeholder="10.000.000"
                    className="form-input font-mono"
                  />
                </FormField>
                <FormField label="Lãi suất (%/năm)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={annualInterestRate}
                    onChange={(event) =>
                      setAnnualInterestRate(
                        event.target.value === '' ? '' : Math.max(0, Number(event.target.value))
                      )
                    }
                    placeholder="5.5"
                    className="form-input font-mono"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Ngày bắt đầu">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Ngày đáo hạn">
                  <input
                    type="date"
                    value={maturityDate}
                    min={startDate}
                    onChange={(event) => setMaturityDate(event.target.value)}
                    className="form-input"
                  />
                </FormField>
              </div>

              <FormField label="Ghi chú">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Điều kiện rút trước hạn, mã hợp đồng..."
                  className="form-input resize-none"
                />
              </FormField>

              {principalAmount !== '' && annualInterestRate !== '' && (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <TrendingUp className="h-4 w-4" />
                    Dự tính khi đáo hạn
                  </div>
                  <div className="mt-2 flex items-center justify-between text-zinc-300">
                    <span>Tổng nhận:</span>
                    <strong className="font-mono text-white">
                      {formatVND(
                        calculateSafetyInvestmentReturn({
                          id: 'preview',
                          providerType,
                          providerName,
                          productName,
                          principalAmount,
                          annualInterestRate,
                          startDate,
                          maturityDate,
                        }).maturityValue
                      )}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-800 bg-[#121214] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 hover:bg-cyan-500"
              >
                {editingInvestment ? 'Lưu Thay Đổi' : 'Lưu Khoản Gửi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {withdrawingInvestment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md">
          <form
            onSubmit={handleWithdrawal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-withdrawal-title"
            className="my-4 w-full max-w-lg overflow-hidden rounded-[28px] border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#121214] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
                  <ArrowDownToLine className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="safety-withdrawal-title" className="text-base font-black text-white">Rút Tiền Khỏi Khoản Gửi</h3>
                  <p data-no-translate="true" className="mt-0.5 truncate text-[11px] text-zinc-400">
                    {withdrawingInvestment.productName} · {withdrawingInvestment.providerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeWithdrawalForm}
                aria-label="Đóng rút tiền"
                className="cursor-pointer rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Tiền gốc ban đầu" value={formatVND(withdrawingInvestment.principalAmount, isAmountsHidden)} />
                <Metric label="Vốn còn lại" value={formatVND(getSafetyInvestmentRemaining(withdrawingInvestment), isAmountsHidden)} tone="cyan" />
              </div>

              {withdrawalError && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">
                  {withdrawalError}
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="safety-withdrawal-amount" className="text-xs font-bold text-zinc-300">
                    Số tiền muốn rút ({getDisplayCurrencyCode()})
                  </label>
                  <button
                    type="button"
                    onClick={() => setWithdrawalAmount(getSafetyInvestmentRemaining(withdrawingInvestment))}
                    className="cursor-pointer text-[10px] font-black text-amber-300 transition-colors hover:text-amber-200 focus:outline-none focus:underline"
                  >
                    Rút toàn bộ
                  </button>
                </div>
                <CurrencyInput
                  id="safety-withdrawal-amount"
                  value={withdrawalAmount}
                  onValueChange={setWithdrawalAmount}
                  min={0}
                  placeholder="0"
                  className="form-input font-mono text-lg font-black"
                />
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  Tối đa {formatVND(getSafetyInvestmentRemaining(withdrawingInvestment), isAmountsHidden)}
                </p>
              </div>

              <div>
                <label htmlFor="safety-withdrawal-date" className="mb-2 block text-xs font-bold text-zinc-300">Ngày rút</label>
                <input
                  id="safety-withdrawal-date"
                  type="date"
                  value={withdrawalDate}
                  min={withdrawingInvestment.startDate}
                  max={today()}
                  onChange={(event) => setWithdrawalDate(event.target.value)}
                  className="form-input"
                />
              </div>

              <div>
                <label htmlFor="safety-withdrawal-notes" className="mb-2 block text-xs font-bold text-zinc-300">Ghi chú</label>
                <textarea
                  id="safety-withdrawal-notes"
                  value={withdrawalNotes}
                  onChange={(event) => setWithdrawalNotes(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="VD: Rút trước hạn, chuyển về tài khoản chính..."
                  className="form-input resize-none"
                />
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-[11px] leading-relaxed text-cyan-200">
                Thao tác này cập nhật số vốn và lưu lịch sử rút. Hệ thống không tự cộng vào hũ SAFE vì khoản gửi ban đầu chưa được trừ khỏi số dư hũ.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 bg-[#121214] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeWithdrawalForm}
                className="cursor-pointer rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={withdrawalAmount === '' || withdrawalAmount <= 0}
                className="cursor-pointer rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black text-zinc-950 transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xác nhận rút tiền
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'emerald' | 'cyan';
}) => (
  <div className="rounded-2xl border border-zinc-800 bg-[#1c1c20] p-4">
    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</div>
    <div
      className={`mt-1 break-words font-mono text-lg font-black ${
        tone === 'emerald'
          ? 'text-emerald-400'
          : tone === 'cyan'
            ? 'text-cyan-400'
            : 'text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

const Metric = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'emerald' | 'cyan';
}) => (
  <div className="rounded-xl border border-zinc-800 bg-[#1c1c20] p-3">
    <div className="text-[10px] font-bold uppercase text-zinc-500">{label}</div>
    <div
      className={`mt-1 break-words font-mono text-xs font-black ${
        tone === 'emerald'
          ? 'text-emerald-400'
          : tone === 'cyan'
            ? 'text-cyan-400'
            : 'text-white'
      }`}
    >
      {value}
    </div>
  </div>
);

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-bold text-zinc-300">{label}</span>
    {children}
  </label>
);
