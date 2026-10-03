import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Plus,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Trash2,
  Check,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { DebtItem, Jar } from '../types';
import { formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { formatDateVI } from '../utils/formatters';
import {
  calculateMonthsCount,
  calculateDebtPaymentPlan,
  getEffectiveMonthlyDebtPayment,
  recalculateJarsWithDebt,
} from '../utils/debtCalculator';
import { CurrencyInput } from './CurrencyInput';
import { apiFetch } from '@platform';
import { toLocalDateKey } from '../utils/monthlyCycle';

const defaultStartDate = () => toLocalDateKey(new Date());
const defaultEndDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return toLocalDateKey(date);
};

interface DebtManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtItems: DebtItem[];
  jars: Jar[];
  monthlyIncome: number;
  onUpdateDebts: (newDebts: DebtItem[]) => void;
  onApplyNewJarAllocations: (updatedJars: Jar[]) => void;
  isAmountsHidden?: boolean;
}

export const DebtManagementModal: React.FC<DebtManagementModalProps> = ({
  isOpen,
  onClose,
  debtItems,
  jars,
  monthlyIncome,
  onUpdateDebts,
  onApplyNewJarAllocations,
  isAmountsHidden = false,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [reallocateStrategy, setReallocateStrategy] = useState<'FFA' | 'PROPORTIONAL'>('FFA');
  const [affectedJarCodes, setAffectedJarCodes] = useState<string[]>([]);
  const [lockGiveJar, setLockGiveJar] = useState(false);
  const [fixedGiveAmount, setFixedGiveAmount] = useState<number | ''>(
    () => jars.find((jar) => jar.code === 'GIVE')?.targetBudget || ''
  );
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, number> | null>(null);
  const [aiReason, setAiReason] = useState('');
  const [isLoadingAiSuggestion, setIsLoadingAiSuggestion] = useState(false);
  const [aiSuggestionError, setAiSuggestionError] = useState('');

  // Form states
  const [debtName, setDebtName] = useState('');
  const [calculationMode, setCalculationMode] = useState<'total' | 'calculated'>('total');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [principalAmount, setPrincipalAmount] = useState<number | ''>('');
  const [interestRate, setInterestRate] = useState<number | ''>('');
  const [interestRatePeriod, setInterestRatePeriod] = useState<'annual' | 'monthly'>('annual');
  const [conversionFeePercent, setConversionFeePercent] = useState<number | ''>('');
  const [startMonth, setStartMonth] = useState(defaultStartDate);
  const [endMonth, setEndMonth] = useState(defaultEndDate);
  const [conversionFee, setConversionFee] = useState<number | ''>('');
  const [conversionFeeMode, setConversionFeeMode] = useState<'upfront' | 'distributed'>('upfront');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const monthsCount = calculateMonthsCount(startMonth, endMonth);
  const principal = principalAmount === '' ? 0 : principalAmount;
  const rate = interestRate === '' ? 0 : interestRate;
  const feePercent = conversionFeePercent === '' ? 0 : conversionFeePercent;
  const paymentPlan = calculateDebtPaymentPlan({
    calculationMode,
    totalDebt: totalAmount === '' ? 0 : totalAmount,
    principalAmount: principal,
    interestRate: rate,
    interestRatePeriod,
    conversionFee: conversionFee === '' ? 0 : conversionFee,
    conversionFeePercent: feePercent,
    conversionFeeMode,
    months: monthsCount,
  });
  const {
    totalDebt: computedTotalDebt,
    interestAmount: calculatedInterest,
    conversionFee: feeAmount,
    regularPayment: actualMonthlyPayment,
    firstMonthPayment,
    distributedFeePerMonth,
  } = paymentPlan;
  const calculatedFee = feeAmount;

  // Active debts calculations
  const activeDebts = debtItems.filter((d) => d.status === 'active' && d.remainingAmount > 0);
  const totalActiveMonthlyPayment = activeDebts.reduce(
    (sum, debt) => sum + getEffectiveMonthlyDebtPayment(debt),
    0
  );
  const totalActiveRemainingAmount = activeDebts.reduce((sum, d) => sum + d.remainingAmount, 0);
  const hasDebtJar = jars.some((jar) => jar.code === 'DEBT');

  const computedDebtJarPercent =
    monthlyIncome > 0
      ? Number(((totalActiveMonthlyPayment / monthlyIncome) * 100).toFixed(2))
      : 0;

  const effectiveAffectedJarCodes =
    reallocateStrategy === 'FFA'
      ? jars.filter((jar) => jar.code !== 'DEBT' && !(lockGiveJar && jar.code === 'GIVE'))
          .map((jar) => jar.code)
      : affectedJarCodes.filter((code) => !(lockGiveJar && code === 'GIVE'));
  const hasValidAffectedJars =
    hasDebtJar && (reallocateStrategy === 'FFA' || effectiveAffectedJarCodes.length > 0);
  const reallocationOptions = {
    strategy: reallocateStrategy,
    affectedJarCodes: effectiveAffectedJarCodes,
    fixedAmounts:
      lockGiveJar && fixedGiveAmount !== ''
        ? { GIVE: Math.max(0, fixedGiveAmount) }
        : undefined,
  };
  const allocationPreview = hasValidAffectedJars
    ? recalculateJarsWithDebt(jars, debtItems, monthlyIncome, reallocationOptions)
    : jars;
  const previewTotalPercent = Number(
    allocationPreview.reduce((sum, jar) => sum + jar.percentage, 0).toFixed(2)
  );
  const previewDebtBudget =
    allocationPreview.find((jar) => jar.code === 'DEBT')?.targetBudget || 0;
  const debtBudgetShortfall = Math.max(0, totalActiveMonthlyPayment - previewDebtBudget);

  const applyJarReallocation = (updatedDebts: DebtItem[]) => {
    if (!hasDebtJar || !hasValidAffectedJars) return;
    const updatedJars = recalculateJarsWithDebt(
      jars,
      updatedDebts,
      monthlyIncome,
      reallocationOptions
    );
    onApplyNewJarAllocations(updatedJars);
  };

  const toggleAffectedJar = (jarCode: string) => {
    setAffectedJarCodes((current) => {
      if (!current.includes(jarCode)) return [...current, jarCode];
      return current.filter((code) => code !== jarCode);
    });
  };

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!debtName.trim() || computedTotalDebt <= 0) {
      setFormError('Vui lòng nhập đầy đủ tên khoản nợ và số tiền hợp lệ.');
      return;
    }
    if (feeAmount > computedTotalDebt) {
      setFormError('Phí chuyển đổi không thể lớn hơn tổng nợ phải thanh toán.');
      return;
    }

    const newDebt: DebtItem = {
      id: 'debt-' + Date.now(),
      name: debtName.trim(),
      totalAmount: computedTotalDebt,
      remainingAmount: computedTotalDebt,
      startMonth: startMonth || defaultStartDate(),
      endMonth: endMonth || defaultEndDate(),
      monthlyPayment: actualMonthlyPayment,
      conversionFee: feeAmount,
      conversionFeeMode,
      calculationMode,
      principalAmount: calculationMode === 'calculated' ? principal : undefined,
      interestRate: calculationMode === 'calculated' ? rate : undefined,
      interestRatePeriod: calculationMode === 'calculated' ? interestRatePeriod : undefined,
      interestAmount: calculationMode === 'calculated' ? calculatedInterest : undefined,
      conversionFeePercent: calculationMode === 'calculated' ? feePercent : undefined,
      status: 'active',
      notes: notes.trim(),
    };

    const updatedDebts = [...debtItems, newDebt];
    onUpdateDebts(updatedDebts);

    // Auto recalculate jars with the new debt list
    applyJarReallocation(updatedDebts);

    // Reset form
    setDebtName('');
    setCalculationMode('total');
    setTotalAmount('');
    setPrincipalAmount('');
    setInterestRate('');
    setInterestRatePeriod('annual');
    setConversionFeePercent('');
    setConversionFee('');
    setConversionFeeMode('upfront');
    setFormError('');
    setNotes('');
    setIsAddingNew(false);
  };

  const handleToggleStatus = (debtId: string) => {
    const updatedDebts = debtItems.map((d) => {
      if (d.id === debtId) {
        const nextStatus = d.status === 'active' ? ('paid' as const) : ('active' as const);
        return {
          ...d,
          status: nextStatus,
          remainingAmount: nextStatus === 'paid' ? 0 : d.totalAmount,
        };
      }
      return d;
    });

    onUpdateDebts(updatedDebts);

    // Auto recalculate jars with the updated status
    applyJarReallocation(updatedDebts);
  };

  const handleDeleteDebt = (debtId: string) => {
    const updatedDebts = debtItems.filter((d) => d.id !== debtId);
    onUpdateDebts(updatedDebts);

    applyJarReallocation(updatedDebts);
  };

  const handleTriggerAutoRecalculate = () => {
    applyJarReallocation(debtItems);
  };

  const handleRequestAiSuggestion = async () => {
    setIsLoadingAiSuggestion(true);
    setAiSuggestionError('');
    try {
      const response = await apiFetch('/api/ai/jar-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jars, monthlyIncome }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Không thể lấy gợi ý từ AI');
      }
      setAiSuggestion(data.allocation);
      setAiReason(data.reason);
    } catch (error: any) {
      setAiSuggestionError(error.message);
    } finally {
      setIsLoadingAiSuggestion(false);
    }
  };

  const handleApplyAiSuggestion = () => {
    if (!aiSuggestion) return;
    const updatedJars = jars.map((jar) => {
      const percentage = aiSuggestion[jar.code];
      return percentage === undefined
        ? jar
        : {
            ...jar,
            percentage,
            targetBudget: Math.round((monthlyIncome * percentage) / 100),
          };
    });
    onApplyNewJarAllocations(updatedJars);
    setAiSuggestion(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/80 sm:backdrop-blur-md sm:p-4 overflow-hidden">
      <div className="bg-[#18181b] rounded-none sm:rounded-[32px] shadow-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] overflow-hidden border-0 sm:border border-zinc-800 sm:my-4 text-zinc-100 flex flex-col">
        {/* Header */}
        <div className="bg-[#121214] text-white px-4 py-4 sm:p-6 relative border-b border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-5 sm:right-5 text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-zinc-800 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start sm:items-center space-x-3 pr-9">
            <div className="hidden sm:block p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-400">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-xl font-black text-white tracking-tight leading-tight">
                  Tự Động Tính % Hũ Trả Nợ (DEBT) & Tái Phân Bổ
                </h2>
                <span className="hidden md:inline text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Smart Auto-Reallocate
                </span>
              </div>
              <p className="hidden sm:block text-xs text-zinc-400 mt-0.5">
                Nhập danh sách khoản nợ và thời gian trả. Ứng dụng sẽ tự tính % Hũ DEBT hàng tháng và tự động tái phân bổ % sang các hũ khác khi trả xong nợ!
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto overscroll-contain flex-1">
          {!hasDebtJar && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Mẫu phân bổ hiện tại không có hũ Trả nợ. Bạn vẫn có thể quản lý danh sách nợ, nhưng hệ thống sẽ không tự thay đổi tỷ lệ các hũ. Hãy chọn mẫu “Ưu tiên trả nợ” nếu muốn tự động phân bổ.</p>
            </div>
          )}
          {/* Smart Calculation Bento Summary Card */}
          <div className="bg-[#121214] border border-zinc-800 rounded-2xl p-3 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tổng Hạn Mức Trả Nợ Hàng Tháng</span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-rose-400 mt-1 break-words">
                  {formatVND(totalActiveMonthlyPayment, isAmountsHidden)}{' '}
                  <span className="text-xs font-sans font-normal text-zinc-400">
                    / tháng ({computedDebtJarPercent}% thu nhập)
                  </span>
                </div>
              </div>

              <div className="flex items-center w-full md:w-auto">
                <button
                  onClick={handleTriggerAutoRecalculate}
                  disabled={!hasValidAffectedJars}
                  className="w-full md:w-auto justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Áp Dụng Phân Bổ Mới</span>
                </button>
              </div>
            </div>

            {/* Sub stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 pt-3 border-t border-zinc-800/80 text-xs">
              <div className="col-span-2 sm:col-span-1 bg-[#1c1c20] p-3 rounded-xl border border-zinc-800">
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Tổng dư nợ còn lại</div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {formatVND(totalActiveRemainingAmount, isAmountsHidden)}
                </div>
              </div>

              <div className="bg-[#1c1c20] p-3 rounded-xl border border-zinc-800">
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Tỷ lệ Hũ DEBT tự động</div>
                <div className="text-sm font-black font-mono text-indigo-400 mt-0.5">
                  {computedDebtJarPercent}% thu nhập
                </div>
              </div>

              <div className="bg-[#1c1c20] p-3 rounded-xl border border-zinc-800">
                <div className="text-[10px] text-zinc-400 font-bold uppercase">Khoản nợ đang trả</div>
                  <div className="text-sm font-black text-emerald-400 mt-0.5">
                    {activeDebts.length} khoản nợ hoạt động
                  </div>
              </div>
            </div>

            {/* Reallocation Strategy Selector */}
            <div className="pt-2">
              <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">
                Chiến lược tự động tái phân bổ khi trả hết nợ:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReallocateStrategy('FFA')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    reallocateStrategy === 'FFA'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-[#1c1c20] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-bold text-xs text-white">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>Ưu tiên điều chỉnh Hũ Tự Do Tài Chính (FFA)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Lấy từ FFA trước; nếu chưa đủ, giảm tỷ lệ các hũ còn lại theo tỷ trọng để DEBT nhận đủ mức trả nợ.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setReallocateStrategy('PROPORTIONAL')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    reallocateStrategy === 'PROPORTIONAL'
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                      : 'bg-[#1c1c20] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-bold text-xs text-white">
                    <Zap className="w-4 h-4 text-indigo-400" />
                    <span>Tự phân bổ đều theo tỷ lệ các hũ còn lại</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Chia phần % còn lại theo tỷ trọng của riêng các hũ bạn cho phép thay đổi.
                  </p>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#1c1c20] p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lockGiveJar}
                    onChange={(event) => {
                      setLockGiveJar(event.target.checked);
                      if (event.target.checked && fixedGiveAmount === '') {
                        setFixedGiveAmount(
                          jars.find((jar) => jar.code === 'GIVE')?.targetBudget || 0
                        );
                      }
                    }}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span>
                    <span className="block text-xs font-bold text-white">
                      Không can thiệp Hũ Cho Đi (GIVE)
                    </span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                      Giữ cố định số tiền của hũ này, hệ thống tự tính lại % theo thu nhập.
                    </span>
                  </span>
                </label>
                {lockGiveJar && (
                  <div className="sm:w-48">
                    <CurrencyInput
                      value={fixedGiveAmount}
                      onValueChange={setFixedGiveAmount}
                      min={0}
                      hideAmount={isAmountsHidden}
                      placeholder="Số tiền cố định"
                      className="w-full px-3 py-2 bg-[#121214] border border-zinc-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {reallocateStrategy === 'PROPORTIONAL' && (
                <div>
                  <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">
                    Các hũ được phép thay đổi tỷ lệ
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {jars
                      .filter((jar) => jar.code !== 'DEBT')
                      .map((jar) => {
                        const isGiveLocked = lockGiveJar && jar.code === 'GIVE';
                        const isSelected =
                          affectedJarCodes.includes(jar.code) && !isGiveLocked;
                        return (
                          <button
                            key={jar.code}
                            type="button"
                            disabled={isGiveLocked}
                            onClick={() => toggleAffectedJar(jar.code)}
                            className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                              isSelected
                                ? 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300'
                                : 'bg-[#1c1c20] border-zinc-800 text-zinc-500'
                            } ${isGiveLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-600'}`}
                          >
                            {isSelected && <Check className="inline w-3.5 h-3.5 mr-1" />}
                            {jar.name} ({jar.code})
                          </button>
                        );
                      })}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2">
                    Hũ không được chọn sẽ giữ nguyên %. Hũ được chọn sẽ chia phần còn lại sau
                    khi trừ DEBT và các hũ cố định.
                  </p>
                  {effectiveAffectedJarCodes.length === 0 && (
                    <p className="text-[11px] font-bold text-amber-400 mt-2">
                      Hãy chọn ít nhất một hũ được phép thay đổi trước khi áp dụng.
                    </p>
                  )}
                </div>
              )}

              <div
                className={`p-3 rounded-xl border text-xs ${
                  debtBudgetShortfall > 1
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                }`}
              >
                <div className="font-bold">
                  Tổng tỷ lệ sau phân bổ: {previewTotalPercent}%
                </div>
                {debtBudgetShortfall > 1 && (
                  <div className="mt-1">
                    Các hũ đang khóa chiếm quá nhiều tỷ lệ, Hũ DEBT còn thiếu{' '}
                    {formatVND(debtBudgetShortfall, isAmountsHidden)}/tháng. Hãy chọn thêm hũ
                    được phép thay đổi hoặc giảm số tiền GIVE.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>AI gợi ý phân bổ sau khi hết nợ</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Giữ nguyên NEC và GIVE, đưa DEBT về 0%, chỉ chia phần dư cho SAFE, FFA, EDU và PLAY.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestAiSuggestion}
                disabled={activeDebts.length > 0 || isLoadingAiSuggestion}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Sparkles className={`w-4 h-4 ${isLoadingAiSuggestion ? 'animate-pulse' : ''}`} />
                <span>{isLoadingAiSuggestion ? 'AI đang phân tích...' : 'Nhận gợi ý AI'}</span>
              </button>
            </div>

            {activeDebts.length > 0 && (
              <div className="text-[11px] text-amber-300">
                Hãy đánh dấu tất cả khoản nợ đã trả xong trước khi yêu cầu AI tái phân bổ.
              </div>
            )}
            {aiSuggestionError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {aiSuggestionError}
              </div>
            )}
            {aiSuggestion && (
              <div className="rounded-xl border border-purple-500/20 bg-[#121214] p-3 space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['NEC', 'GIVE', 'DEBT', 'SAFE', 'FFA', 'EDU', 'PLAY'].map((code) => (
                    <div key={code} className="rounded-lg border border-zinc-800 bg-[#1c1c20] p-2 text-center">
                      <div className="text-[10px] font-bold text-zinc-500">{code}</div>
                      <div className="text-sm font-black font-mono text-white">
                        {aiSuggestion[code]}%
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{aiReason}</p>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-400">
                    Tổng đề xuất:{' '}
                    {Object.values(aiSuggestion).reduce((sum, value) => sum + value, 0).toFixed(2)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyAiSuggestion}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                  >
                    Áp dụng gợi ý này
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Add New Debt Toggle Button */}
          <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-rose-400" />
              <span>Danh Sách Các Khoản Nợ</span>
            </h3>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="w-full min-[380px]:w-auto justify-center px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>{isAddingNew ? 'Đóng form' : 'Thêm khoản nợ mới'}</span>
            </button>
          </div>

          {/* Add New Debt Form */}
          {isAddingNew && (
            <form
              onSubmit={handleAddDebt}
              className="bg-[#121214] p-3 sm:p-5 rounded-2xl border border-rose-500/30 space-y-4 animate-in fade-in"
            >
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Plus className="w-4 h-4" />
                <span>Khai Báo Khoản Nợ Mới</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#1c1c20] p-1.5 rounded-xl border border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCalculationMode('total');
                    setFormError('');
                  }}
                  className={`p-2.5 rounded-lg font-bold transition-all ${
                    calculationMode === 'total'
                      ? 'bg-rose-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  Nhập tổng nợ từ ngân hàng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalculationMode('calculated');
                    setFormError('');
                  }}
                  className={`p-2.5 rounded-lg font-bold transition-all ${
                    calculationMode === 'calculated'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  Tự tính từ tiền chuyển đổi & lãi suất
                </button>
              </div>

              {formError && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-300">Tên khoản nợ</label>
                  <input
                    type="text"
                    placeholder="VD: Trả góp xe máy, Vay mua nhà"
                    value={debtName}
                    onChange={(e) => setDebtName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {calculationMode === 'total' ? (
                  <>
                    <div className="space-y-1">
                      <label className="font-bold text-zinc-300">
                        Tổng nợ phải thanh toán, đã gồm lãi và phí ({getDisplayCurrencyCode()})
                      </label>
                      <CurrencyInput
                        placeholder={isAmountsHidden ? '••••••••' : 'VD: 65.000.000'}
                        value={totalAmount}
                        onValueChange={setTotalAmount}
                        hideAmount={isAmountsHidden}
                        required
                        min={1}
                        className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-zinc-300">
                        Phần phí chuyển đổi nằm trong tổng nợ ({getDisplayCurrencyCode()})
                      </label>
                      <CurrencyInput
                        placeholder={isAmountsHidden ? '••••••••' : 'VD: 500.000'}
                        value={conversionFee}
                        onValueChange={setConversionFee}
                        hideAmount={isAmountsHidden}
                        min={0}
                        className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="font-bold text-zinc-300">Số tiền chuyển đổi trả góp ({getDisplayCurrencyCode()})</label>
                      <CurrencyInput
                        placeholder={isAmountsHidden ? '••••••••' : 'VD: 60.000.000'}
                        value={principalAmount}
                        onValueChange={setPrincipalAmount}
                        hideAmount={isAmountsHidden}
                        required
                        min={1}
                        className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-zinc-300">Lãi suất</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="VD: 12"
                          className="min-w-0 flex-1 px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                        />
                        <select
                          value={interestRatePeriod}
                          onChange={(e) => setInterestRatePeriod(e.target.value as 'annual' | 'monthly')}
                          className="px-2.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="annual">%/năm</option>
                          <option value="monthly">%/tháng</option>
                        </select>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Tự tính theo lãi đơn trên số tiền chuyển đổi. Nếu ngân hàng dùng công thức khác,
                        hãy chọn nhập tổng nợ từ ngân hàng.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-zinc-300">Phí chuyển đổi trả góp (%)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={conversionFeePercent}
                        onChange={(e) => setConversionFeePercent(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="VD: 1.5"
                        className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300">Ngày bắt đầu trả</label>
                  <input
                    type="date"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    required
                    className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500 [color-scheme:dark] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300">Ngày kết thúc khoản nợ</label>
                  <input
                    type="date"
                    min={startMonth}
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    required
                    className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500 [color-scheme:dark] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-300">Cách ngân hàng thu phí</label>
                  <select
                    value={conversionFeeMode}
                    onChange={(e) => setConversionFeeMode(e.target.value as 'upfront' | 'distributed')}
                    className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="upfront">Thu toàn bộ một lần khi chuyển đổi</option>
                    <option value="distributed">Chia đều và cộng vào từng tháng</option>
                  </select>
                </div>
              </div>

              {/* Calculated payment preview */}
              <div className="bg-[#1c1c20] p-3 rounded-xl border border-zinc-800 grid grid-cols-1 sm:grid-cols-3 text-xs gap-3">
                <div className="text-zinc-400">
                  Thời gian vay: <span className="text-white font-bold">{monthsCount} tháng</span> ({formatDateVI(startMonth)} đến {formatDateVI(endMonth)})
                </div>
                <div className="text-zinc-400">
                  Tổng nợ phải thanh toán:{' '}
                  <span className="font-mono text-white text-sm font-black">{formatVND(computedTotalDebt, isAmountsHidden)}</span>
                </div>
                <div className="text-rose-300 font-bold sm:text-right">
                  {conversionFeeMode === 'distributed' ? 'Trả mỗi tháng (đã gồm phí):' : 'Trả định kỳ mỗi tháng:'}{' '}
                  <span className="font-mono text-white text-sm font-black">{formatVND(actualMonthlyPayment, isAmountsHidden)}</span>
                </div>
              </div>

              {calculationMode === 'calculated' && computedTotalDebt > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-zinc-300">
                    Tiền chuyển đổi: <strong className="text-white">{formatVND(principal, isAmountsHidden)}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-zinc-300">
                    Tổng tiền lãi: <strong className="text-white">{formatVND(calculatedInterest, isAmountsHidden)}</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-zinc-300">
                    Phí chuyển đổi: <strong className="text-white">{formatVND(calculatedFee, isAmountsHidden)}</strong>
                  </div>
                </div>
              )}

              {feeAmount > 0 && (
                <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span>
                    Phí chuyển đổi: <strong>{formatVND(feeAmount, isAmountsHidden)}</strong> —{' '}
                    {conversionFeeMode === 'upfront'
                      ? 'ngân hàng thu một lần trong tháng bắt đầu'
                      : `chia đều ${formatVND(distributedFeePerMonth, isAmountsHidden)}/tháng`}
                  </span>
                  <span className="font-bold">
                    {conversionFeeMode === 'upfront'
                      ? `Tháng đầu: ${formatVND(firstMonthPayment, isAmountsHidden)}`
                      : `Tổng phải trả: ${formatVND(computedTotalDebt, isAmountsHidden)}`}
                  </span>
                </div>
              )}

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-300">Ghi chú thêm (không bắt buộc)</label>
                <input
                  type="text"
                  placeholder="VD: Trích nợ tự động ngân hàng VCB ngày 20"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex flex-col-reverse min-[380px]:flex-row min-[380px]:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="w-full min-[380px]:w-auto px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="w-full min-[380px]:w-auto justify-center px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lưu Khoản Nợ Mới</span>
                </button>
              </div>
            </form>
          )}

          {/* Debt List */}
          <div className="space-y-3">
            {debtItems.length === 0 ? (
              <div className="bg-[#121214] p-8 rounded-2xl border border-zinc-800 text-center text-zinc-400 space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto text-emerald-400" />
                <h4 className="font-bold text-white text-sm">Hiện Không Có Khoản Nợ Nào</h4>
                <p className="text-xs max-w-sm mx-auto">
                  Tất cả các khoản nợ đã được trả sạch! Hũ DEBT tự động giảm về 0% và toàn bộ số tiền thu nhập được chuyển sang đầu tư & tích lũy.
                </p>
              </div>
            ) : (
              debtItems.map((debt) => {
                const isPaid = debt.status === 'paid' || debt.remainingAmount <= 0;
                const months = calculateMonthsCount(debt.startMonth, debt.endMonth);
                const fee = debt.conversionFee || 0;
                const effectivePayment = getEffectiveMonthlyDebtPayment(debt);

                return (
                  <div
                    key={debt.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isPaid
                        ? 'bg-[#121214]/60 border-zinc-800/80 opacity-75'
                        : 'bg-[#121214] border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isPaid ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                            }`}
                          />
                          <h4 data-no-translate="true" className="font-bold text-sm text-white">{debt.name}</h4>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              isPaid
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {isPaid ? 'Đã Trả Hết ✓' : 'Đang Trả Nợ'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            <span>
                              {formatDateVI(debt.startMonth)} đến {formatDateVI(debt.endMonth)} ({months} tháng)
                            </span>
                          </span>
                          {debt.notes && <span data-no-translate="true">• {debt.notes}</span>}
                        </div>
                      </div>

                      {/* Right side stats & action */}
                      <div className="flex items-end sm:items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
                        <div className="text-left sm:text-right min-w-0">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">
                            Trả Mỗi Tháng
                          </div>
                          <div className="text-sm font-black font-mono text-rose-300">
                            {formatVND(effectivePayment, isAmountsHidden)}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            Tổng nợ đã gồm lãi & phí: {formatVND(debt.totalAmount, isAmountsHidden)}
                          </div>
                          {fee > 0 && (
                            <div className="text-[10px] text-amber-400">
                              Phí {formatVND(fee, isAmountsHidden)} ·{' '}
                              {debt.conversionFeeMode === 'distributed' ? 'chia theo tháng' : 'thu một lần'}
                            </div>
                          )}
                          {debt.calculationMode === 'calculated' && (
                            <div className="text-[10px] text-indigo-400">
                              Gốc {formatVND(debt.principalAmount || 0, isAmountsHidden)} · Lãi{' '}
                              {formatVND(debt.interestAmount || 0, isAmountsHidden)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleToggleStatus(debt.id)}
                            title={isPaid ? 'Đánh dấu chưa trả hết' : 'Đánh dấu đã hoàn thành'}
                            className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                              isPaid
                                ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                                : 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/20'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDebt(debt.id)}
                            title="Xóa khoản nợ"
                            className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#121214] p-3 sm:p-5 border-t border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="hidden sm:flex text-xs text-zinc-400 items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Tự động đồng bộ với PostgreSQL theo tài khoản</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl sm:rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/20"
          >
            Đóng & Áp Dụng
          </button>
        </div>
      </div>
    </div>
  );
};
