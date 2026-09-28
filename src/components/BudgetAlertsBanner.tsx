import React from 'react';
import { AlertTriangle, AlertCircle, ArrowRight, ShieldAlert, X } from 'lucide-react';
import { Jar } from '../types';
import { formatVND } from '../utils/formatters';

interface BudgetAlertsBannerProps {
  jars: Jar[];
  onOpenAIAdvisor: () => void;
  onOpenTransactionModal: (jarId: string) => void;
  isAmountsHidden?: boolean;
}

export const BudgetAlertsBanner: React.FC<BudgetAlertsBannerProps> = ({
  jars,
  onOpenAIAdvisor,
  onOpenTransactionModal,
  isAmountsHidden = false,
}) => {

  const alertedJars = jars.filter((j) => {
    if (j.code !== 'NEC' || j.targetBudget <= 0) return false;
    const ratio = j.currentSpent / j.targetBudget;
    return ratio >= 0.8;
  });

  if (alertedJars.length === 0) return null;

  return (
    <div className="space-y-3 my-4">
      {alertedJars.map((jar) => {
        const ratio = (jar.currentSpent / jar.targetBudget) * 100;
        const isDanger = ratio > 100;

        return (
          <div
            key={jar.id}
            className={`p-5 rounded-[28px] border shadow-lg transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isDanger
                ? 'bg-rose-950/20 border-rose-500/40 text-rose-100'
                : 'bg-amber-950/20 border-amber-500/40 text-amber-100'
            }`}
          >
            <div className="flex items-start space-x-3.5">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  isDanger ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {isDanger ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-sm tracking-tight">
                    {isDanger ? '🔴 CẢNH BÁO VƯỢT HẠN MỨC' : '⚡ CẢNH BÁO TIÊU DÙNG (>=80%)'}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#1c1c20] border border-zinc-700 text-zinc-200">
                    {jar.name} ({jar.code})
                  </span>
                </div>
                <p className="text-xs mt-1 text-zinc-300 leading-relaxed">
                  Hũ {jar.name} đã chi <strong className="text-white font-mono">{formatVND(jar.currentSpent, isAmountsHidden)}</strong> / Hạn mức{' '}
                  <strong className="text-white font-mono">{formatVND(jar.targetBudget, isAmountsHidden)}</strong> ({ratio.toFixed(1)}%).
                  {isDanger

                    ? ' Đã vượt hạn mức ngân sách đặt ra cho tháng!'
                    : ' Vui lòng cân nhắc kiểm soát các khoản chi tiêu tiếp theo.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={onOpenAIAdvisor}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1.5"
              >
                <span>Tư Vấn AI</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
