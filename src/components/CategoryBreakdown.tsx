import React, { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CategoryTotal } from '../utils/analytics';
import { formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { localizeText } from './TranslationLayer';

const PAGE_SIZE = 6;

// Distinct leading colours; the whole chart and every legend page share this map.
const CATEGORY_COLOURS = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16', '#a855f7', '#f97316', '#d946ef', '#10b981', '#eab308', '#3b82f6'];

export function CategoryBreakdown({ categories, chartLabel, emptyLabel, isAmountsHidden, onViewTransactions, totalLabel, basisLabel }: {
  categories: CategoryTotal[];
  chartLabel: string;
  emptyLabel: string;
  isAmountsHidden: boolean;
  onViewTransactions?: (category: CategoryTotal) => void;
  totalLabel?: string;
  basisLabel?: string;
}) {
  const [page, setPage] = useState(0);
  const isEnglish = getRuntimePreferences().language === 'en';
  const labels = isEnglish ? {
    total: 'Recorded total', transactions: 'transactions', categories: 'categories',
    previous: 'Previous categories', next: 'Next categories', page: 'Page',
    basis: 'Percentages use the recorded transactions in this cycle.',
    hidden: 'Turn off Hide Amounts to view chart details.',
  } : {
    total: 'Tổng đã ghi chép', transactions: 'giao dịch', categories: 'danh mục',
    previous: 'Danh mục trước', next: 'Danh mục tiếp theo', page: 'Trang',
    basis: 'Tỷ trọng tính trên các giao dịch đã ghi chép trong chu kỳ này.',
    hidden: 'Tắt chế độ ẩn tiền để xem chi tiết biểu đồ.',
  };
  // Do not mount charts, tooltips or financial accessibility text in privacy mode.
  if (isAmountsHidden) return <p data-no-translate="true" className="py-10 text-center text-xs text-zinc-400">{labels.hidden}</p>;
  if (!categories.length) return <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-400">{emptyLabel}</p>;

  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  const data = categories.map((category, index) => ({
    ...category,
    key: category.name,
    name: category.isCustom ? category.name : localizeText(category.name, isEnglish ? 'en' : 'vi'),
    colour: CATEGORY_COLOURS[index] || `hsl(${(index * 137.508) % 360}, 65%, 48%)`,
  }));
  const pages = Math.ceil(data.length / PAGE_SIZE);
  const currentPage = Math.min(page, pages - 1);
  const rows = data.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const percent = (value: number) => new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN', {
    style: 'percent', maximumFractionDigits: 1,
  }).format(total > 0 ? value / total : 0);
  const transactionCount = (count: number) => `${count} ${isEnglish && count === 1 ? 'transaction' : labels.transactions}`;

  return (
    <div data-no-translate="true">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-zinc-400">{totalLabel || labels.total}</span>
        <strong className="break-all font-mono text-sm text-white">{formatVND(total)}</strong>
      </div>
      <div role="img" aria-label={chartLabel} className="mx-auto my-2 h-56 w-full max-w-xs">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false} aria-hidden="true">
            <Pie data={data} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={94}
              paddingAngle={0} stroke="var(--chart-sector-border, #121214)" strokeWidth={1} isAnimationActive={false}>
              {data.map(row => <Cell key={row.key} fill={row.colour} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              const row = payload?.[0]?.payload as typeof data[number] | undefined;
              return active && row ? (
                <div data-no-translate="true" className="max-w-[240px] rounded-xl border border-zinc-700 bg-[#121214] p-3 text-xs shadow-xl">
                  <p className="break-words font-semibold text-zinc-200">{row.name}</p>
                  <p className="mt-1 font-mono text-white">{formatVND(row.amount)} · {percent(row.amount)}</p>
                  <p className="mt-1 text-zinc-400">{transactionCount(row.count)}</p>
                </div>
              ) : null;
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="mb-4 text-center text-[11px] text-zinc-400">{basisLabel || labels.basis}</p>
      <ul aria-label={chartLabel} className="space-y-3">
        {rows.map(row => (
          <li key={row.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 text-xs">
              <span className="flex min-w-0 items-baseline gap-2 font-semibold text-zinc-200">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.colour }} />
                <span className="break-words [overflow-wrap:anywhere]">{row.name}</span>
              </span>
              <strong className="shrink-0 text-right font-mono text-white">{formatVND(row.amount)}</strong>
            {onViewTransactions ? (
              <button type="button" onClick={() => onViewTransactions(categories.find(category => category.name === row.key)!)}
                aria-label={`${isEnglish ? 'View transactions' : 'Xem giao dịch'} · ${row.name}`}
                className="ml-[18px] min-h-6 w-fit min-w-12 cursor-pointer rounded text-left text-[11px] leading-6 text-zinc-400 underline-offset-2 transition-colors hover:text-indigo-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {transactionCount(row.count)}
              </button>
            ) : <p className="ml-[18px] text-[11px] leading-6 text-zinc-400">{transactionCount(row.count)}</p>}
            <span className="text-right font-mono text-[10px] leading-6 text-zinc-400">{percent(row.amount)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label={chartLabel} className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
          <button type="button" aria-label={labels.previous} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-zinc-700 text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span aria-live="polite" className="text-center text-[11px] text-zinc-400">{labels.page} {currentPage + 1}/{pages} · {data.length} {labels.categories}</span>
          <button type="button" aria-label={labels.next} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-zinc-700 text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
