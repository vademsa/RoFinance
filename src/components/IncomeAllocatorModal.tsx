import React, { useEffect, useState } from 'react';
import { X, Calculator, ArrowRight, CheckCircle2, Building2, Percent, Wallet, CreditCard } from 'lucide-react';
import { Jar } from '../types';
import { formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { CurrencyInput } from './CurrencyInput';
import { getCarryoverTotal, getTransferredInTotal } from '../utils/monthlyCycle';

interface IncomeAllocatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  jars: Jar[];
  currentIncome: number;
  onApplyAllocation: (newIncome: number, updatedJars: Jar[]) => void;
  onOpenDebtModal?: () => void;
}

export const IncomeAllocatorModal: React.FC<IncomeAllocatorModalProps> = ({
  isOpen,
  onClose,
  jars,
  currentIncome,
  onApplyAllocation,
  onOpenDebtModal,
}) => {
  const [incomeInput, setIncomeInput] = useState<number>(currentIncome);
  const [tempJars, setTempJars] = useState<Jar[]>(jars);

  useEffect(() => {
    if (!isOpen) return;
    setIncomeInput(currentIncome);
    setTempJars(jars.map((jar) => ({ ...jar })));
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePercentageChange = (jarId: string, newPercent: number) => {
    setTempJars((prev) =>
      prev.map((j) => (j.id === jarId ? { ...j, percentage: newPercent } : j))
    );
  };

  const totalPercentage = tempJars.reduce((sum, j) => sum + (j.percentage || 0), 0);

  const handleSave = () => {
    // Calculate new target budgets
    const updated = tempJars.map((j) => ({
      ...j,
      cycleAllocation: Math.round((incomeInput * j.percentage) / 100),
      targetBudget: getCarryoverTotal(j) + getTransferredInTotal(j) + Math.round((incomeInput * j.percentage) / 100),
    }));
    onApplyAllocation(incomeInput, updated);
    onClose();
  };

  const handleQuickPreset = (amount: number) => {
    setIncomeInput(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#18181b] rounded-[32px] shadow-2xl max-w-3xl w-full overflow-hidden border border-zinc-800 my-8 text-zinc-100">
        {/* Header */}
        <div className="bg-[#121214] text-white p-6 relative border-b border-zinc-800">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Phân Bổ Hũ Tài Chính Hàng Tháng</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Nhập thu nhập và tỷ lệ cho từng hũ; RoFinance chỉ lưu kế hoạch bạn xác nhận
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Income Input Section */}
          <div className="bg-[#121214] p-5 rounded-2xl border border-zinc-800 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
              Nhập tổng thu nhập / lương hàng tháng ({getDisplayCurrencyCode()})
            </label>
            <div className="relative">
              <CurrencyInput
                value={incomeInput || ''}
                onValueChange={(value) => setIncomeInput(value === '' ? 0 : value)}
                placeholder="20.000.000"
                className="w-full pl-4 pr-16 py-3.5 text-2xl font-black font-mono text-white bg-[#1c1c20] border border-zinc-700 rounded-2xl focus:border-indigo-500 focus:outline-none transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-400">
                {getDisplayCurrencyCode()}
              </span>
            </div>

            {/* Quick Amounts */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-400 font-medium">Gợi ý nhanh:</span>
              {[15000000, 20000000, 30000000, 50000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickPreset(amt)}
                  className={`px-3 py-1.5 text-xs font-bold font-mono rounded-xl border transition-all ${
                    incomeInput === amt
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-[#1c1c20] text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  {formatVND(amt)}
                </button>
              ))}
            </div>
          </div>

          {/* Allocation Table */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center space-x-2">
                <Percent className="w-4 h-4 text-indigo-400" />
                <span>Tỷ lệ phân bổ theo {tempJars.length} Hũ Tài Chính & Ngân Hàng</span>
              </h3>
              <div className="flex items-center space-x-2">
                {onOpenDebtModal && (
                  <button
                    type="button"
                    onClick={onOpenDebtModal}
                    className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-all flex items-center space-x-1"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-rose-400" />
                    <span>Tự tính % Hũ DEBT</span>
                  </button>
                )}
                <div
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    Math.abs(totalPercentage - 100) < 0.01
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  Tổng tỷ lệ: {totalPercentage.toFixed(2)}% {Math.abs(totalPercentage - 100) < 0.01 ? '✓ chuẩn' : '⚠️'}
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 rounded-2xl overflow-x-auto bg-[#121214]">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-[#1c1c20] text-zinc-400 text-[11px] font-bold uppercase tracking-wider border-b border-zinc-800">
                    <th className="p-3.5">Ngân Hàng</th>
                    <th className="p-3.5">Hũ Tài Chính</th>
                    <th className="p-3.5 text-center w-28">Tỷ Lệ (%)</th>
                    <th className="p-3.5 text-right">Phân bổ kỳ mới</th>
                    <th className="p-3.5 text-right">Tổng khả dụng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-xs">
                  {tempJars.map((jar) => {
                    const allocatedAmount = Math.round((incomeInput * jar.percentage) / 100);
                    const carryoverAmount = getCarryoverTotal(jar);
                    const transferredAmount = getTransferredInTotal(jar);
                    const existingAmount = carryoverAmount + transferredAmount;
                    return (
                      <tr key={jar.id} className="hover:bg-[#1c1c20] transition-colors">
                        <td className="p-3.5 font-semibold text-zinc-200">
                          <div className="flex items-center space-x-2">
                            <Building2 className="w-4 h-4 text-indigo-400" />
                            <span>{jar.bankName}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center space-x-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                              style={{ backgroundColor: jar.color }}
                            />
                            <div>
                              <div className="font-bold text-white">
                                {jar.name} <span className="text-xs font-normal text-zinc-400">({jar.code})</span>
                              </div>
                              <div className="text-[11px] text-zinc-400 line-clamp-1">{jar.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="inline-flex items-center space-x-1">
                            <input
                              type="number"
                              step="0.05"
                              value={jar.percentage}
                              onChange={(e) => handlePercentageChange(jar.id, parseFloat(e.target.value) || 0)}
                              className="w-20 text-center font-bold text-white bg-[#1c1c20] border border-zinc-700 rounded-xl py-1 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs font-bold text-zinc-400">%</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-right font-black font-mono text-indigo-300">
                          {formatVND(allocatedAmount)}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          <div className="font-black text-emerald-300">{formatVND(allocatedAmount + existingAmount)}</div>
                          {existingAmount > 0 && (
                            <div className="mt-0.5 text-[10px] text-zinc-500">
                              gồm tiền dư/chuyển {formatVND(existingAmount)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#121214] p-5 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 font-bold text-xs hover:bg-zinc-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Áp Dụng Phân Bổ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
