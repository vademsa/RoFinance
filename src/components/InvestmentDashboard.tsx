import React, { useState } from 'react';
import { Bitcoin, Eye, EyeOff, Landmark, PieChart, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import type { CryptoAsset, Jar, SafetyInvestment } from '../types';
import { DEFAULT_USD_VND_RATE } from '../constants/defaultData';
import { formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { CryptoInvestment } from './CryptoInvestment';
import {
  SafetyInvestmentPortfolio,
} from './SafetyInvestmentPortfolio';
import {
  calculateSafetyInvestmentReturn,
  getSafetyInvestmentRemaining,
} from '../utils/safetyInvestments';

interface InvestmentDashboardProps {
  cryptoAssets: CryptoAsset[];
  onAddCryptoAsset: (asset: Omit<CryptoAsset, 'id'>) => void;
  onUpdateCryptoAsset: (asset: CryptoAsset) => void;
  onDeleteCryptoAsset: (id: string) => void;
  safetyInvestments: SafetyInvestment[];
  onAddSafetyInvestment: (investment: Omit<SafetyInvestment, 'id'>) => void;
  onUpdateSafetyInvestment: (investment: SafetyInvestment) => void;
  onDeleteSafetyInvestment: (id: string) => void;
  isAmountsHidden: boolean;
  onToggleHideAmounts: () => void;
  jars: Jar[];
}

export function calculateInvestmentOverview(
  cryptoAssets: CryptoAsset[],
  safetyInvestments: SafetyInvestment[],
  usdVndRate: number
) {
  const cryptoCapital = cryptoAssets.reduce(
    (total, asset) => total + Math.max(0, asset.amountHeld) * Math.max(0, asset.buyPriceUSD) * usdVndRate,
    0
  );
  const safetyCapital = safetyInvestments.reduce(
    (total, investment) => total + getSafetyInvestmentRemaining(investment),
    0
  );
  const expectedSafetyInterest = safetyInvestments.reduce(
    (total, investment) => total + calculateSafetyInvestmentReturn(investment).expectedInterest,
    0
  );
  const totalCapital = cryptoCapital + safetyCapital;

  return {
    totalCapital,
    cryptoCapital,
    safetyCapital,
    expectedSafetyInterest,
    cryptoShare: totalCapital > 0 ? (cryptoCapital / totalCapital) * 100 : 0,
    safetyShare: totalCapital > 0 ? (safetyCapital / totalCapital) * 100 : 0,
  };
}

export const InvestmentDashboard: React.FC<InvestmentDashboardProps> = ({
  cryptoAssets,
  onAddCryptoAsset,
  onUpdateCryptoAsset,
  onDeleteCryptoAsset,
  safetyInvestments,
  onAddSafetyInvestment,
  onUpdateSafetyInvestment,
  onDeleteSafetyInvestment,
  isAmountsHidden,
  onToggleHideAmounts,
  jars,
}) => {
  const [activeInvestmentType, setActiveInvestmentType] = useState<'crypto' | 'safe'>('crypto');
  const usdVndRate = getRuntimePreferences().usdVndRate || DEFAULT_USD_VND_RATE;
  const overview = calculateInvestmentOverview(cryptoAssets, safetyInvestments, usdVndRate);
  const [cryptoMetrics, setCryptoMetrics] = useState({
    currentValueVND: overview.cryptoCapital,
    investedVND: overview.cryptoCapital,
    pnlVND: 0,
    pnlPercent: 0,
  });
  const currentPortfolioValue = cryptoMetrics.currentValueVND + overview.safetyCapital;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-zinc-800 bg-[#121214] p-4 shadow-xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">Danh Mục Đầu Tư</h1>
              <button
                type="button"
                onClick={onToggleHideAmounts}
                aria-label={isAmountsHidden ? 'Hiển thị số tiền' : 'Ẩn số tiền'}
                aria-pressed={isAmountsHidden}
                className={`group relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
                  isAmountsHidden
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border-zinc-700 bg-[#1c1c20] text-zinc-400 hover:text-white'
                }`}
              >
                {isAmountsHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  {isAmountsHidden ? 'Hiển thị số tiền' : 'Ẩn số tiền'}
                </span>
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Quản lý tài sản số và các khoản gửi quỹ an toàn sinh lãi trong cùng một nơi
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-800 bg-[#1c1c20] p-1.5 sm:min-w-[360px]">
            <button
              type="button"
              onClick={() => setActiveInvestmentType('crypto')}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                activeInvestmentType === 'crypto'
                  ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Bitcoin className="h-4 w-4" />
              <span>Tài Sản Số</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveInvestmentType('safe')}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${
                activeInvestmentType === 'safe'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Quỹ An Toàn Sinh Lãi</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <article className="investment-total-card relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/15 via-[#18181b] to-cyan-500/10 p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-indigo-500/15 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-indigo-300">
                <WalletCards className="h-4 w-4" aria-hidden="true" />
                Tổng giá trị hiện tại
              </div>
              <div className="mt-3 break-words font-mono text-2xl font-black text-white sm:text-3xl" aria-live="polite">
                {formatVND(currentPortfolioValue, isAmountsHidden)}
              </div>
              <div className="mt-3"><div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lãi / lỗ tài sản số</div><div className={`mt-1 font-mono text-sm font-black ${cryptoMetrics.pnlVND >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{cryptoMetrics.pnlVND >= 0 ? '+' : ''}{formatVND(cryptoMetrics.pnlVND, isAmountsHidden)} <span className="whitespace-nowrap">({cryptoMetrics.pnlVND >= 0 ? '+' : ''}{cryptoMetrics.pnlPercent.toFixed(2)}%)</span></div></div>
              <p className="mt-2 text-xs text-zinc-400">{cryptoAssets.length} tài sản số · {safetyInvestments.length} khoản gửi an toàn</p>
            </div>
          </article>

          <div className="grid grid-cols-2 gap-3">
            <article className="rounded-2xl border border-zinc-800 bg-[#1c1c20] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                <Bitcoin className="h-4 w-4 text-amber-400" aria-hidden="true" />
                Vốn tài sản số
              </div>
              <div className="mt-2 break-words font-mono text-base font-black text-white sm:text-lg">
                {formatVND(overview.cryptoCapital, isAmountsHidden)}
              </div>
            </article>
            <article className="rounded-2xl border border-zinc-800 bg-[#1c1c20] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                <Landmark className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                Vốn quỹ an toàn
              </div>
              <div className="mt-2 break-words font-mono text-base font-black text-white sm:text-lg">
                {formatVND(overview.safetyCapital, isAmountsHidden)}
              </div>
            </article>
            <article className="col-span-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Lãi an toàn dự kiến
              </div>
              <div className="mt-2 font-mono text-lg font-black text-emerald-400">
                +{formatVND(overview.expectedSafetyInterest, isAmountsHidden)}
              </div>
            </article>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-zinc-800 bg-[#1c1c20] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <PieChart className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              Tỷ trọng danh mục
            </div>
            <span className="text-[11px] text-zinc-400">Theo vốn đã đầu tư</span>
          </div>
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800"
            role="img"
            aria-label={`Tài sản số ${overview.cryptoShare.toFixed(1)}%, quỹ an toàn ${overview.safetyShare.toFixed(1)}%`}
          >
            <div className="bg-amber-500 transition-[width] duration-300" style={{ width: `${overview.cryptoShare}%` }} />
            <div className="bg-cyan-500 transition-[width] duration-300" style={{ width: `${overview.safetyShare}%` }} />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-3 text-[11px] font-semibold">
            <div className="flex items-center justify-between gap-2 text-zinc-300">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Tài sản số</span>
              <span>{overview.cryptoShare.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-zinc-300">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500" />Quỹ an toàn</span>
              <span>{overview.safetyShare.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </section>

      {activeInvestmentType === 'crypto' ? (
        <CryptoInvestment
          cryptoAssets={cryptoAssets}
          onAddCryptoAsset={onAddCryptoAsset}
          onUpdateCryptoAsset={onUpdateCryptoAsset}
          onDeleteCryptoAsset={onDeleteCryptoAsset}
          isAmountsHidden={isAmountsHidden}
          jars={jars}
          onMetricsChange={setCryptoMetrics}
        />
      ) : (
        <SafetyInvestmentPortfolio
          investments={safetyInvestments}
          onAddInvestment={onAddSafetyInvestment}
          onUpdateInvestment={onUpdateSafetyInvestment}
          onDeleteInvestment={onDeleteSafetyInvestment}
          isAmountsHidden={isAmountsHidden}
        />
      )}
    </div>
  );
};
