import React, { useState } from 'react';
import {
  Building2,
  Edit2,
  Plus,
  QrCode,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Percent,
  Wallet,
  ArrowUpRight,
  ShieldAlert,
  Info,
  CreditCard,
  Eye,
  EyeOff,
  LayoutTemplate,
} from 'lucide-react';
import { Jar } from '../types';
import { formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { CurrencyInput } from './CurrencyInput';
import { BANK_OPTIONS } from '../constants/defaultData';
import { ReceiveQRModal } from './ReceiveQRModal';
import { canCreateVietQR } from '../utils/vietqrPayload';
import {
  getCarryoverTotal,
  getTransferredInTotal,
  normalizeJarBudgetState,
  setJarCycleAllocation,
} from '../utils/monthlyCycle';

interface JarManagementProps {
  jars: Jar[];
  monthlyIncome: number;
  onOpenIncomeModal: () => void;
  onOpenTransactionModal: (defaultJarId?: string) => void;
  onUpdateJar: (updatedJar: Jar) => Promise<void>;
  onOpenDebtModal?: () => void;
  isAmountsHidden?: boolean;
  onToggleHideAmounts: () => void;
  onOpenJarPlanSelector: () => void;
}

export const JarManagement: React.FC<JarManagementProps> = ({
  jars,
  monthlyIncome,
  onOpenIncomeModal,
  onOpenTransactionModal,
  onUpdateJar,
  onOpenDebtModal,
  isAmountsHidden = false,
  onToggleHideAmounts,
  onOpenJarPlanSelector,
}) => {
  const [editingJar, setEditingJar] = useState<Jar | null>(null);
  const [allocationInputMode, setAllocationInputMode] = useState<'percentage' | 'amount'>('percentage');
  const [isSavingJar, setIsSavingJar] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [receivingJar, setReceivingJar] = useState<Jar | null>(null);

  const totalSpent = jars.reduce((sum, j) => sum + j.currentSpent, 0);
  const totalBudget = jars.reduce((sum, j) => sum + j.targetBudget, 0);
  const totalRemaining = totalBudget - totalSpent;
  const overallUsagePercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJar || isSavingJar) return;
    if (editingJar.bankCode && !/^\d{6,19}$/.test(editingJar.accountNumber.trim())) {
      setSaveError('Số tài khoản phải gồm 6–19 chữ số.');
      return;
    }
    if (editingJar.bankCode && !editingJar.accountName.trim()) {
      setSaveError('Vui lòng nhập tên chủ tài khoản.');
      return;
    }
    setIsSavingJar(true);
    setSaveError('');
    try {
      await onUpdateJar({
        ...editingJar,
        accountNumber: editingJar.accountNumber.trim(),
        accountName: editingJar.accountName.trim(),
        bankName: editingJar.bankName.trim(),
      });
      setEditingJar(null);
    } catch (error: any) {
      setSaveError(error.message || 'Không thể lưu cấu hình. Vui lòng thử lại.');
    } finally {
      setIsSavingJar(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Financial Health Summary Bento Card */}
      <div className="bg-[#121214] border border-zinc-800 rounded-2xl sm:rounded-[32px] p-4 sm:p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -top-20 w-60 h-60 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold mb-3">
              <Wallet className="w-3.5 h-3.5" />
              <span>Sức Khỏe Tài Chính Tháng Này</span>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-mono break-words">
                {formatVND(monthlyIncome, isAmountsHidden)} <span className="block sm:inline text-xs sm:text-sm font-sans font-normal text-zinc-400 mt-1 sm:mt-0">/ thu nhập tháng</span>
              </h2>
              <button
                type="button"
                onClick={onToggleHideAmounts}
                aria-label={isAmountsHidden ? 'Hiển thị số tiền' : 'Ẩn số tiền'}
                className={`group relative w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
                  isAmountsHidden
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-zinc-700 bg-[#1c1c20] text-zinc-400 hover:text-white'
                }`}
              >
                {isAmountsHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  {isAmountsHidden ? 'Hiển thị số tiền' : 'Ẩn số tiền'}
                </span>
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-2 max-w-xl leading-relaxed">
              Chọn mẫu phù hợp hoặc tự điều chỉnh các hũ theo thu nhập và phong cách sống của bạn.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={onOpenJarPlanSelector}
              className="col-span-2 cursor-pointer rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-300 transition-colors hover:bg-cyan-500/20 sm:col-span-1"
            >
              <span className="flex items-center justify-center gap-1.5"><LayoutTemplate className="h-4 w-4" /> Chọn kiểu phân bổ</span>
            </button>
            <button
              onClick={onOpenIncomeModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-1.5"
            >
              <Wallet className="w-4 h-4" />
              <span>Cập Nhật Thu Nhập</span>
            </button>
            <button
              onClick={() => onOpenTransactionModal()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/20 transition-all flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Ghi Nhận Chi Tiêu</span>
            </button>
          </div>
        </div>

        {/* Stats Bento Sub-Grid */}
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-zinc-800 relative z-10">
          <div className="bg-[#1c1c20] p-4 rounded-2xl border border-zinc-800/80">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tổng Hạn Mức</div>
            <div className="text-base sm:text-lg font-black text-white mt-1 font-mono">{formatVND(totalBudget, isAmountsHidden)}</div>
          </div>
          <div className="bg-[#1c1c20] p-4 rounded-2xl border border-zinc-800/80">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Đã Chi Tiêu</div>
            <div
              className={`text-base sm:text-lg font-black mt-1 font-mono ${
                overallUsagePercent > 100 ? 'text-rose-400' : overallUsagePercent >= 80 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {formatVND(totalSpent, isAmountsHidden)} <span className="text-xs font-sans font-semibold">({overallUsagePercent.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="bg-[#1c1c20] p-4 rounded-2xl border border-zinc-800/80">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Thặng Dư Còn Lại</div>
            <div className={`text-base sm:text-lg font-black mt-1 font-mono ${totalRemaining < 0 ? 'text-rose-400' : 'text-indigo-300'}`}>
              {formatVND(totalRemaining, isAmountsHidden)}
            </div>
          </div>

          <div className="bg-[#1c1c20] p-4 rounded-2xl border border-zinc-800/80">
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Trạng Thái An Toàn</div>
            <div className="flex items-center space-x-1.5 mt-1.5">
              {overallUsagePercent > 100 ? (
                <span className="text-xs font-bold text-rose-400 flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Vượt Hạn Mức</span>
                </span>
              ) : overallUsagePercent >= 80 ? (
                <span className="text-xs font-bold text-amber-400 flex items-center space-x-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Cảnh Báo (&gt;=80%)</span>
                </span>
              ) : (
                <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Cân Bằng Rất Tốt</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial jars grid section header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white tracking-tight flex items-center space-x-2">
            <span>Danh Sách {jars.length} Hũ Tài Chính</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Mỗi hũ liên kết với tài khoản ngân hàng riêng biệt và có cảnh báo ngưỡng chi tiêu tự động
          </p>
        </div>

        {onOpenDebtModal && (
          <button
            onClick={onOpenDebtModal}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-2xl text-xs font-bold transition-all flex items-center space-x-1.5 shrink-0"
          >
            <CreditCard className="w-4 h-4 text-rose-400" />
            <span>Tự Tính % Hũ DEBT & Quản Lý Nợ</span>
          </button>
        )}
      </div>

      {/* Financial jars Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jars.map((jar) => {
          const normalizedJar = normalizeJarBudgetState(jar);
          const carryoverTotal = getCarryoverTotal(normalizedJar);
          const transferredInTotal = getTransferredInTotal(normalizedJar);
          const usagePercent = jar.targetBudget > 0 ? (jar.currentSpent / jar.targetBudget) * 100 : 0;
          const isDanger = usagePercent > 100;
          const isWarning = usagePercent >= 80 && usagePercent <= 100;
          const remaining = jar.targetBudget - jar.currentSpent;

          return (
            <div
              key={jar.id}
              className={`bg-[#121214] rounded-2xl sm:rounded-[28px] p-4 sm:p-6 border transition-all duration-200 shadow-xl flex flex-col justify-between relative overflow-hidden group hover:border-zinc-700 ${
                isDanger
                  ? 'border-rose-500/50 bg-rose-950/10 ring-1 ring-rose-500/30'
                  : isWarning
                  ? 'border-amber-500/50 bg-amber-950/10 ring-1 ring-amber-500/30'
                  : 'border-zinc-800'
              }`}
            >
              {/* Top Bar with Code Badge and Edit button */}
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: jar.color }}
                    />
                    <div>
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                        {jar.code} • {jar.percentage}%
                      </span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">{jar.name}</h4>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setAllocationInputMode('percentage');
                      setEditingJar(normalizedJar);
                    }}
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                    title="Chỉnh sửa thông số hũ"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Bank Associated */}
                <div className="mt-4 bg-[#1c1c20] p-3 rounded-2xl border border-zinc-800 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center space-x-2 min-w-0">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-zinc-200">{jar.bankName}</span>
                  </div>
                  <span className="font-mono text-zinc-400 font-semibold break-all">{jar.accountNumber}</span>
                </div>
              </div>

              {/* Progress Bar & Amounts */}
              <div className="my-6 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-zinc-400">Đã chi / Hạn mức:</span>
                  <span className={`font-mono ${isDanger ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-zinc-100'}`}>
                    {formatVND(jar.currentSpent, isAmountsHidden)} / {formatVND(jar.targetBudget, isAmountsHidden)}
                  </span>
                </div>

                {/* Progress Bar Container */}
                <div className="w-full h-3 bg-zinc-800/80 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(100, usagePercent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 pt-0.5">
                  <span className="font-mono">Còn: {formatVND(remaining, isAmountsHidden)}</span>

                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                      isDanger
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : isWarning
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {isDanger ? 'Vượt hạn mức' : isWarning ? 'Cảnh báo 80%' : 'An Toàn'}
                  </span>
                </div>

                {carryoverTotal > 0 && (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-bold text-cyan-300">Dư chuyển tiếp</span>
                      <span className="font-mono font-black text-cyan-200">{formatVND(carryoverTotal, isAmountsHidden)}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(normalizedJar.carryovers || []).map((item) => (
                        <div key={`${item.sourceCycleStart}-${item.sourceCycleEnd}`} className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                          <span>{item.sourceJarName ? `${item.sourceJarName} · ` : ''}Kỳ {item.sourceCycleStart} – {item.sourceCycleEnd}</span>
                          <span className="font-mono font-semibold text-zinc-300">{formatVND(item.amount, isAmountsHidden)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {transferredInTotal > 0 && (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3">
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-bold text-indigo-300">Chuyển từ cấu hình cũ</span>
                      <span className="font-mono font-black text-indigo-200">{formatVND(transferredInTotal, isAmountsHidden)}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(normalizedJar.transferredIn || []).map((item, index) => (
                        <div key={`${item.sourceJarId || item.sourceJarCode}-${item.sourceCycleStart}-${index}`} className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                          <span>{item.sourceJarName || item.sourceJarCode || 'Hũ cũ'} · kỳ {item.sourceCycleStart}</span>
                          <span className="font-mono font-semibold text-zinc-300">{formatVND(item.amount, isAmountsHidden)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onOpenTransactionModal(jar.id)}
                  className="flex-1 py-2.5 px-3 bg-[#1c1c20] hover:bg-zinc-800 text-zinc-200 font-bold text-xs rounded-xl transition-all border border-zinc-800 flex items-center justify-center space-x-1.5 min-w-[100px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ghi Chi Tiêu</span>
                </button>
                {jar.code === 'DEBT' && onOpenDebtModal ? (
                  <button
                    onClick={onOpenDebtModal}
                    className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5"
                    title="Tự động tính % theo danh sách khoản nợ"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-rose-400" />
                    <span>Tự Tính % DEBT</span>
                  </button>
                ) : null}
                {canCreateVietQR(jar.bankCode, jar.accountNumber) && <button
                  type="button"
                  onClick={() => setReceivingJar(jar)}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-500/20"
                  title="Tạo QR nhận tiền vào hũ"
                ><QrCode className="h-3.5 w-3.5" /><span>QR nhận tiền</span></button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Jar Modal */}
      {editingJar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#18181b] border border-zinc-800 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-extrabold text-base text-white">
                Cấu Hình Hũ: {editingJar.name} ({editingJar.code})
              </h3>
              <button
                onClick={() => setEditingJar(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800"
              >
                <AlertCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-4 text-xs">
              {saveError && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
                  {saveError}
                </div>
              )}
              {['GIVE', 'NEC', 'SAFE'].includes(editingJar.code) && (
                <div className="grid grid-cols-2 gap-1.5 bg-[#121214] border border-zinc-800 rounded-xl p-1.5">
                  <button
                    type="button"
                    onClick={() => setAllocationInputMode('percentage')}
                    className={`py-2 rounded-lg font-bold transition-colors ${
                      allocationInputMode === 'percentage'
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Nhập phần trăm
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllocationInputMode('amount')}
                    className={`py-2 rounded-lg font-bold transition-colors ${
                      allocationInputMode === 'amount'
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Nhập số tiền
                  </button>
                </div>
              )}

              {!['GIVE', 'NEC', 'SAFE'].includes(editingJar.code) || allocationInputMode === 'percentage' ? (
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">Tỷ Lệ Phân Bổ (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingJar.percentage}
                    onChange={(e) => {
                      const percentage = Math.max(0, parseFloat(e.target.value) || 0);
                      setEditingJar(setJarCycleAllocation(
                        { ...editingJar, percentage },
                        Math.round((monthlyIncome * percentage) / 100),
                      ));
                    }}
                    className="w-full p-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl font-bold text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  {['GIVE', 'NEC', 'SAFE'].includes(editingJar.code) && (
                    <p className="mt-1.5 text-[11px] text-zinc-400">
                      Phân bổ kỳ này: <strong className="text-emerald-400">{formatVND(editingJar.cycleAllocation || 0, isAmountsHidden)}</strong>
                      {getCarryoverTotal(editingJar) > 0 && (
                        <span> · Tổng khả dụng {formatVND(editingJar.targetBudget, isAmountsHidden)}</span>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-zinc-300 mb-1">
                    Số Tiền Hũ {editingJar.name} ({getDisplayCurrencyCode()})
                  </label>
                  <CurrencyInput
                    value={editingJar.cycleAllocation || 0}
                    hideAmount={isAmountsHidden}
                    onValueChange={(value) => {
                      const cycleAllocation = value === '' ? 0 : Math.max(0, value);
                      const percentage =
                        monthlyIncome > 0
                          ? Number(((cycleAllocation / monthlyIncome) * 100).toFixed(2))
                          : 0;
                      setEditingJar(setJarCycleAllocation(
                        { ...editingJar, percentage },
                        cycleAllocation,
                      ));
                    }}
                    min={0}
                    placeholder={isAmountsHidden ? '••••••••' : 'VD: 1.000.000'}
                    className="w-full p-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl font-bold font-mono text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-[11px] text-zinc-300">
                    Tỷ lệ quy đổi:{' '}
                    <strong className="text-emerald-400">{editingJar.percentage}%</strong>
                    <span className="block text-zinc-500 mt-0.5">
                      Dựa trên thu nhập tháng {formatVND(monthlyIncome, isAmountsHidden)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-300 mb-1">Ngân Hàng Thụ Hưởng</label>
                <select
                  value={editingJar.bankCode}
                  onChange={(e) => {
                    const bank = BANK_OPTIONS.find((item) => item.code === e.target.value);
                    setEditingJar(bank
                      ? { ...editingJar, bankCode: bank.code, bankName: bank.shortName }
                      : {
                          ...editingJar,
                          bankCode: '',
                          bankName: 'Chưa cấu hình',
                          accountNumber: '',
                          accountName: '',
                        });
                  }}
                  className="w-full p-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl font-medium text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Chọn ngân hàng</option>
                  {BANK_OPTIONS.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1">Số Tài Khoản</label>
                <input
                  type="text"
                  value={editingJar.accountNumber}
                  inputMode="numeric"
                  maxLength={19}
                  onChange={(e) => setEditingJar({
                    ...editingJar,
                    accountNumber: e.target.value.replace(/\D/g, '').slice(0, 19),
                  })}
                  className="w-full p-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 mb-1">Chủ Tài Khoản</label>
                <input
                  type="text"
                  value={editingJar.accountName}
                  maxLength={100}
                  onChange={(e) => setEditingJar({ ...editingJar, accountName: e.target.value.slice(0, 100) })}
                  className="w-full p-2.5 bg-[#1c1c20] border border-zinc-700 rounded-xl font-medium text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingJar(null)}
                  className="px-4 py-2 border border-zinc-700 rounded-xl text-zinc-300 font-bold hover:bg-zinc-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingJar}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {isSavingJar ? 'Đang lưu...' : 'Lưu Cấu Hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ReceiveQRModal jar={receivingJar} isAmountsHidden={isAmountsHidden} onClose={() => setReceivingJar(null)} />
    </div>
  );
};
