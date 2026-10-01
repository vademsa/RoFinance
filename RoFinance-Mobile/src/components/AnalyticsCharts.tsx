import React, { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarRange,
  Check, ChevronDown, Layers3, Pencil, Target, Wallet, X,
} from 'lucide-react';
import type { Jar, MonthlyCycleSummary, Transaction } from '../types';
import { formatShortVND, formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode, getRuntimePreferences } from '../lib/preferences';
import { formatCycleDate, parseLocalDate } from '../utils/monthlyCycle';
import {
  buildAnalyticsCycles, getCategoryTotals, getRecentCycleTotals,
  type CategoryTotal,
} from '../utils/analytics';
import { CurrencyInput } from './CurrencyInput';

interface AnalyticsChartsProps {
  jars: Jar[];
  jarRegistry?: Jar[];
  transactions: Transaction[];
  monthlyIncome: number;
  isAmountsHidden?: boolean;
  monthlySummaries: MonthlyCycleSummary[];
  resetDay: number;
  onUpdateSummaryIncome: (summaryId: string, income: number) => void;
}

function MetricCard({
  label, value, detail, tone, icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'emerald' | 'rose' | 'indigo' | 'cyan';
  icon: React.ReactNode;
}) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
    indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400',
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
  };
  return (
    <div className={'min-w-0 rounded-2xl border p-4 ' + tones[tone]}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words font-mono text-xl font-black text-white sm:text-2xl">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{detail}</p>
    </div>
  );
}

function CategoryList({
  categories, total, emptyLabel, countLabel, otherLabel, isAmountsHidden,
}: {
  categories: CategoryTotal[];
  total: number;
  emptyLabel: string;
  countLabel: string;
  otherLabel: string;
  isAmountsHidden: boolean;
}) {
  if (isAmountsHidden) {
    return <p className="py-10 text-center text-sm text-zinc-400">••••••••</p>;
  }
  if (!categories.length) {
    return <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-400">{emptyLabel}</p>;
  }
  const visible = categories.slice(0, 6);
  const remainder = categories.slice(6);
  const rows = remainder.length
    ? [...visible, { name: otherLabel, amount: remainder.reduce((sum, row) => sum + row.amount, 0), count: remainder.reduce((sum, row) => sum + row.count, 0) }]
    : visible;
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const share = total > 0 ? (row.amount / total) * 100 : 0;
        return (
          <div key={row.name} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-semibold text-zinc-200" title={row.name}>{row.name}</span>
              <span className="shrink-0 font-mono font-bold text-white">{formatVND(row.amount, isAmountsHidden)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: Math.min(100, share) + '%' }} />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[10px] text-zinc-400">{share.toFixed(1)}%</span>
            </div>
            <span className="text-[10px] text-zinc-500">{row.count} {countLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({
  jars,
  jarRegistry = jars,
  transactions,
  monthlyIncome,
  isAmountsHidden = false,
  monthlySummaries,
  resetDay,
  onUpdateSummaryIncome,
}) => {
  const [selectedCycleId, setSelectedCycleId] = useState('CURRENT');
  const [overviewScope, setOverviewScope] = useState('RECENT');
  const [chartMode, setChartMode] = useState<'cashflow' | 'budget'>('cashflow');
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<number | ''>('');
  const isEnglish = getRuntimePreferences().language === 'en';
  const labels = isEnglish ? {
    title: 'Financial analytics',
    subtitle: 'Income, spending and budgets by financial cycle',
    cycle: 'Reporting cycle',
    current: 'Current',
    income: 'Income',
    expense: 'Expenses',
    net: 'Net cash flow',
    carryover: 'Jar balance to carry forward',
    currentBalance: 'Unspent jar budget',
    incomeDetail: 'Confirmed income for this cycle',
    expenseDetail: 'Recorded spending for this cycle',
    netDetail: 'Income minus expenses; this is not a bank balance',
    carryoverDetail: 'Unspent jar budget, including earlier cycles',
    currentBalanceDetail: 'The unspent amount can carry into the next cycle',
    surplus: 'Surplus',
    deficit: 'Deficit',
    keepRate: 'Retained from income',
    noIncomeRate: 'No income recorded',
    trend: 'Income, spending and net flow',
    budgetTrend: 'Available budget vs actual spending',
    chartView: 'Chart view',
    cashflowTab: 'Cash flow',
    budgetTab: 'Budget vs actual',
    scrollHint: 'Swipe sideways to see more cycles.',
    trendDetail: 'Up to 12 cycles. Income is confirmed per cycle; spending follows recorded transactions where details are complete.',
    yearTrendDetail: 'Grouped by cycle start year. Income is confirmed per cycle; spending follows complete transaction details.',
    overviewScope: 'Overview range',
    recentOption: 'Last 12 cycles',
    yearOption: 'Cycle start year',
    recent: 'Overview of recent cycles',
    yearly: 'Year overview',
    recentDetail: 'Includes the current, unfinished cycle',
    topExpenses: 'Top expense categories in this range',
    totalIncome: 'Total income',
    totalExpense: 'Total expenses',
    totalNet: 'Net flow',
    averageExpense: 'Average spent per cycle',
    budget: 'Jar budget vs actual spending',
    budgetDetail: 'Available budget includes this cycle’s allocation and money carried in.',
    newAllocation: 'Allocated this cycle',
    opening: 'Carried in / transferred',
    available: 'Available budget',
    spent: 'Spent',
    remaining: 'Remaining',
    archived: 'Archived',
    noHistoricalBudget: 'Historical budget details are unavailable for this cycle.',
    noJars: 'No jar data is available for this cycle.',
    overspent: 'Over budget',
    categories: 'Where the money went',
    categoryDetail: 'Highest expense categories in the selected cycle',
    sources: 'Recorded income sources',
    sourceDetail: 'Only income entered as transactions is categorized here.',
    incompleteSources: 'Categorized transactions may differ from confirmed cycle income.',
    incompleteExpenses: 'Category details may not cover all confirmed expenses in older cycles.',
    uncategorizedExpense: 'Detailed expense transactions are unavailable for this cycle.',
    noIncomeTransactions: 'No categorized income transactions in this cycle.',
    other: 'Other categories',
    transactions: 'transactions',
    carryoverSources: 'Carryover by source cycle',
    history: 'Cycle history',
    historyDetail: 'Select a completed cycle to inspect its details.',
    noHistory: 'A completed cycle will appear after the next reset.',
    editIncome: 'Edit cycle income',
    saveIncome: 'Save cycle income',
    cancelEdit: 'Cancel editing',
    hidden: 'Turn off Hide Amounts to view chart details.',
    currency: 'Currency',
    count: 'Transactions',
    cycleCount: 'cycles',
  } : {
    title: 'Thống kê tài chính',
    subtitle: 'Thu, chi và ngân sách theo từng chu kỳ tài chính',
    cycle: 'Chu kỳ thống kê',
    current: 'Hiện tại',
    income: 'Thu nhập',
    expense: 'Chi tiêu',
    net: 'Dòng tiền ròng',
    carryover: 'Dư hũ chuyển tiếp',
    currentBalance: 'Dư hũ hiện còn',
    incomeDetail: 'Thu nhập đã xác nhận trong chu kỳ',
    expenseDetail: 'Khoản chi đã ghi trong chu kỳ',
    netDetail: 'Thu trừ chi; không phải số dư ngân hàng',
    carryoverDetail: 'Ngân sách hũ chưa dùng, gồm cả tiền từ kỳ trước',
    currentBalanceDetail: 'Phần chưa dùng có thể chuyển sang chu kỳ tiếp theo',
    surplus: 'Thặng dư',
    deficit: 'Bội chi',
    keepRate: 'Tỷ lệ giữ lại trên thu nhập',
    noIncomeRate: 'Chưa ghi nhận thu nhập',
    trend: 'Xu hướng thu, chi và dòng tiền ròng',
    budgetTrend: 'Ngân sách khả dụng so với thực chi',
    chartView: 'Kiểu biểu đồ',
    cashflowTab: 'Dòng tiền',
    budgetTab: 'Ngân sách / thực chi',
    scrollHint: 'Vuốt ngang để xem các chu kỳ khác.',
    trendDetail: 'Tối đa 12 chu kỳ. Thu lấy từ số đã xác nhận; chi tính từ giao dịch khi đủ chi tiết.',
    yearTrendDetail: 'Nhóm theo năm bắt đầu chu kỳ. Thu lấy từ số đã xác nhận; chi tính từ giao dịch khi đủ chi tiết.',
    overviewScope: 'Phạm vi tổng quan',
    recentOption: '12 chu kỳ gần nhất',
    yearOption: 'Năm bắt đầu chu kỳ',
    recent: 'Tổng quan các chu kỳ gần đây',
    yearly: 'Tổng quan theo năm',
    recentDetail: 'Có tính cả chu kỳ hiện tại đang diễn ra',
    topExpenses: 'Danh mục chi nhiều nhất trong phạm vi này',
    totalIncome: 'Tổng thu',
    totalExpense: 'Tổng chi',
    totalNet: 'Thu trừ chi',
    averageExpense: 'Chi trung bình mỗi chu kỳ',
    budget: 'Ngân sách hũ so với thực chi',
    budgetDetail: 'Ngân sách khả dụng gồm phân bổ kỳ này và tiền được chuyển vào.',
    newAllocation: 'Phân bổ kỳ này',
    opening: 'Dư cũ / tiền chuyển vào',
    available: 'Ngân sách khả dụng',
    spent: 'Đã chi',
    remaining: 'Còn lại',
    archived: 'Đã lưu',
    noHistoricalBudget: 'Chu kỳ này chưa có chi tiết hạn mức lịch sử.',
    noJars: 'Chưa có dữ liệu hũ cho chu kỳ này.',
    overspent: 'Vượt ngân sách',
    categories: 'Chi tiêu theo danh mục',
    categoryDetail: 'Các danh mục chi nhiều nhất trong chu kỳ đã chọn',
    sources: 'Nguồn thu đã ghi giao dịch',
    sourceDetail: 'Chỉ các khoản thu được nhập thành giao dịch mới có phân loại tại đây.',
    incompleteSources: 'Tổng giao dịch đã phân loại có thể khác thu nhập đã xác nhận.',
    incompleteExpenses: 'Chi tiết danh mục có thể chưa bao phủ toàn bộ chi tiêu của các chu kỳ cũ.',
    uncategorizedExpense: 'Chưa có giao dịch chi chi tiết cho chu kỳ này.',
    noIncomeTransactions: 'Chưa có giao dịch thu được phân loại trong chu kỳ.',
    other: 'Danh mục khác',
    transactions: 'giao dịch',
    carryoverSources: 'Tiền dư theo chu kỳ nguồn',
    history: 'Lịch sử tổng kết chu kỳ',
    historyDetail: 'Chọn một chu kỳ đã kết thúc để xem chi tiết.',
    noHistory: 'Tổng kết đầu tiên sẽ xuất hiện sau lần reset tiếp theo.',
    editIncome: 'Sửa thu nhập chu kỳ',
    saveIncome: 'Lưu thu nhập chu kỳ',
    cancelEdit: 'Hủy chỉnh sửa',
    hidden: 'Tắt chế độ ẩn tiền để xem chi tiết biểu đồ.',
    currency: 'Đơn vị',
    count: 'Giao dịch',
    cycleCount: 'chu kỳ',
  };

  const cycles = useMemo(() => buildAnalyticsCycles({
    jars, jarRegistry, transactions, summaries: monthlySummaries,
    monthlyIncome, resetDay,
  }), [jars, jarRegistry, transactions, monthlySummaries, monthlyIncome, resetDay]);
  const current = cycles.find((cycle) => cycle.isCurrent)!;
  const selected = selectedCycleId === 'CURRENT'
    ? current
    : cycles.find((cycle) => cycle.id === selectedCycleId) || current;
  const completed = cycles.filter((cycle) => !cycle.isCurrent).reverse();
  const yearOptions = [...new Set(cycles.map((cycle) => cycle.start.slice(0, 4)))].reverse();
  const effectiveOverviewScope = overviewScope === 'RECENT' || yearOptions.includes(overviewScope)
    ? overviewScope : 'RECENT';
  const overviewCycles = effectiveOverviewScope === 'RECENT'
    ? cycles
    : cycles.filter((cycle) => cycle.start.startsWith(effectiveOverviewScope));
  const overview = getRecentCycleTotals(overviewCycles, effectiveOverviewScope === 'RECENT' ? 12 : overviewCycles.length);
  const overviewExpenseCategories = getCategoryTotals(overview.cycles.flatMap((cycle) => cycle.transactions), 'expense');
  const expenseCategories = getCategoryTotals(selected.transactions, 'expense');
  const incomeCategories = getCategoryTotals(selected.transactions, 'income');
  const recordedIncome = incomeCategories.reduce((sum, row) => sum + row.amount, 0);
  const recordedExpense = expenseCategories.reduce((sum, row) => sum + row.amount, 0);
  const sortedJars = [...selected.jars].sort((a, b) =>
    (b.budget ?? b.spent) - (a.budget ?? a.spent));
  const carryoverJars = selected.jars.filter((jar) =>
    !jar.archived && jar.closingCarryovers.some((source) => source.amount > 0));
  const retentionRate = selected.income > 0 ? selected.net / selected.income : null;
  const formatPercent = (value: number) => new Intl.NumberFormat(isEnglish ? 'en-US' : 'vi-VN', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value * 100) + '%';
  const formatAxisMoney = (value: number) => {
    if (getDisplayCurrencyCode() !== 'VND') return formatShortVND(value, isAmountsHidden);
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000_000) return Number((value / 1_000_000_000).toFixed(2)) + ' tỷ';
    if (absolute >= 1_000_000) return Number((value / 1_000_000).toFixed(2)) + ' tr';
    if (absolute >= 1_000) return Number((value / 1_000).toFixed(1)) + 'k';
    return String(value);
  };
  const cycleLabel = (start: string, end: string) => {
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    return startDate && endDate
      ? formatCycleDate(startDate, isEnglish ? 'en' : 'vi') + ' – ' + formatCycleDate(endDate, isEnglish ? 'en' : 'vi')
      : start + ' – ' + end;
  };
  const chartData = overview.cycles.map((cycle) => ({
    id: cycle.id,
    label: cycle.start.slice(8, 10) + '/' + cycle.start.slice(5, 7),
    period: cycleLabel(cycle.start, cycle.end),
    income: cycle.income,
    expense: cycle.expense,
    net: cycle.net,
    budget: cycle.budget,
  }));
  const shortCycleLabel = (start: string, end: string) =>
    start.slice(8, 10) + '/' + start.slice(5, 7) + ' – ' + end.slice(8, 10) + '/' + end.slice(5, 7) + '/' + end.slice(0, 4);
  const historySummaries = [...monthlySummaries]
    .filter((summary) => summary.cycleStart !== current.start)
    .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart));
  const completedById = new Map(completed.map((cycle) => [cycle.id, cycle]));

  const renderIncomeEditor = (summary: MonthlyCycleSummary, suffix: string) => {
    if (editingSummaryId !== summary.id) {
      return (
        <button
          type="button"
          disabled={isAmountsHidden}
          aria-label={labels.editIncome + ' ' + summary.cycleStart}
          onClick={() => {
            setEditingSummaryId(summary.id);
            setIncomeDraft(summary.income);
          }}
          className="group ml-auto flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 font-mono text-emerald-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed"
        >
          {formatVND(summary.income, isAmountsHidden)}
          {!isAmountsHidden && <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />}
        </button>
      );
    }
    const inputId = 'summary-income-' + summary.id + '-' + suffix;
    return (
      <div className="flex items-center justify-end gap-1">
        <label htmlFor={inputId} className="sr-only">{labels.editIncome}</label>
        <CurrencyInput
          id={inputId}
          value={incomeDraft}
          onValueChange={setIncomeDraft}
          min={0}
          hideAmount={isAmountsHidden}
          className="w-28 rounded-lg border border-zinc-700 bg-[#18181b] px-2 py-1.5 text-right font-mono text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
        <button
          type="button"
          aria-label={labels.saveIncome}
          disabled={incomeDraft === ''}
          onClick={() => {
            if (incomeDraft === '') return;
            onUpdateSummaryIncome(summary.id, Math.max(0, incomeDraft));
            setEditingSummaryId(null);
          }}
          className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={labels.cancelEdit}
          onClick={() => setEditingSummaryId(null)}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5 text-zinc-100">
      <header className="flex flex-col gap-4 rounded-[24px] border border-zinc-800 bg-[#121214] p-4 shadow-xl sm:p-6 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-400" />
            <h2 className="text-xl font-black tracking-tight text-white">{labels.title}</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{labels.subtitle}</p>
          <p className="mt-2 text-[11px] font-medium text-indigo-300">{cycleLabel(selected.start, selected.end)}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2">
            <CalendarRange className="h-4 w-4 shrink-0 text-indigo-400" />
            <div className="min-w-0 flex-1">
              <label htmlFor="analytics-cycle" className="block text-[10px] font-bold uppercase tracking-wide text-indigo-300">{labels.cycle}</label>
              <select
                id="analytics-cycle"
                value={selected.isCurrent ? 'CURRENT' : selectedCycleId}
                onChange={(event) => setSelectedCycleId(event.target.value)}
                className="mt-1 w-full min-w-0 rounded-lg border border-zinc-700 bg-[#18181b] px-2 py-1.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:w-60"
              >
                <option value="CURRENT">{labels.current}</option>
                {completed.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>{shortCycleLabel(cycle.start, cycle.end)}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            {isEnglish ? 'Exports are available on the web version.' : 'Xuất báo cáo hiện có trên bản web.'}
          </p>
        </div>
      </header>

      <section aria-label={labels.title} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={labels.income} value={formatVND(selected.income, isAmountsHidden)} detail={labels.incomeDetail} tone="emerald" icon={<ArrowDownRight className="h-4 w-4" />} />
        <MetricCard label={labels.expense} value={formatVND(selected.expense, isAmountsHidden)} detail={labels.expenseDetail} tone="rose" icon={<ArrowUpRight className="h-4 w-4" />} />
        <MetricCard
          label={labels.net}
          value={formatVND(selected.net, isAmountsHidden)}
          detail={labels.netDetail}
          tone={selected.net < 0 ? 'rose' : 'indigo'}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <MetricCard
          label={selected.isCurrent ? labels.currentBalance : labels.carryover}
          value={selected.carryover === null ? '—' : formatVND(selected.carryover, isAmountsHidden)}
          detail={selected.isCurrent ? labels.currentBalanceDetail : labels.carryoverDetail}
          tone="cyan"
          icon={<Wallet className="h-4 w-4" />}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={'rounded-full border px-3 py-1 font-bold ' + (selected.net < 0
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400')}>
          {selected.net < 0 ? labels.deficit : labels.surplus}
        </span>
        <span className="rounded-full border border-zinc-800 bg-[#121214] px-3 py-1 text-zinc-300">
          {labels.keepRate}: {isAmountsHidden ? '••••' : retentionRate === null ? labels.noIncomeRate : formatPercent(retentionRate)}
        </span>
        <span className="rounded-full border border-zinc-800 bg-[#121214] px-3 py-1 text-zinc-400">
          {selected.transactionCount} {labels.transactions}
        </span>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="min-w-0 rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-white"><BarChart3 className="h-4 w-4 text-indigo-400" />{chartMode === 'cashflow' ? labels.trend : labels.budgetTrend}</h3>
              <p className="mt-1 text-xs text-zinc-400">{effectiveOverviewScope === 'RECENT' ? labels.trendDetail : labels.yearTrendDetail}</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="analytics-overview-scope" className="sr-only">{labels.overviewScope}</label>
              <select
                id="analytics-overview-scope"
                value={effectiveOverviewScope}
                onChange={(event) => setOverviewScope(event.target.value)}
                className="max-w-full rounded-lg border border-zinc-700 bg-[#18181b] px-2 py-1.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <option value="RECENT">{labels.recentOption}</option>
                {yearOptions.map((year) => <option key={year} value={year}>{labels.yearOption} {year}</option>)}
              </select>
              <span className="hidden text-[10px] text-zinc-500 sm:inline">{labels.currency}: {getDisplayCurrencyCode()}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={labels.chartView}>
            <button
              type="button"
              aria-pressed={chartMode === 'cashflow'}
              onClick={() => setChartMode('cashflow')}
              className={'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' + (chartMode === 'cashflow' ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800')}
            >{labels.cashflowTab}</button>
            <button
              type="button"
              aria-pressed={chartMode === 'budget'}
              onClick={() => setChartMode('budget')}
              className={'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' + (chartMode === 'budget' ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300' : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800')}
            >{labels.budgetTab}</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-400">
            {(chartMode === 'cashflow'
              ? [[labels.income, '#10b981'], [labels.expense, '#fb7185'], [labels.net, '#818cf8']]
              : [[labels.available, '#818cf8'], [labels.spent, '#fb7185']]
            ).map(([name, color]) => (
              <span key={name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{name}</span>
            ))}
          </div>
          {isAmountsHidden ? (
            <p className="py-24 text-center text-sm text-zinc-400">{labels.hidden}</p>
          ) : chartMode === 'budget' && !overview.cycles.some((cycle) => cycle.budget !== null) ? (
            <p className="py-24 text-center text-sm text-zinc-400">{labels.noHistoricalBudget}</p>
          ) : chartMode === 'cashflow' && overview.income === 0 && overview.expense === 0 ? (
            <p className="py-24 text-center text-sm text-zinc-400">{labels.noHistory}</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <div className="h-72 min-w-[620px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#3f3f46" strokeDasharray="3 5" vertical={false} opacity={0.35} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={formatAxisMoney} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={66} />
                    <ReferenceLine y={0} stroke="#71717a" />
                    <Tooltip
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.period || ''}
                      formatter={(value: number, name: string) => [formatVND(value, isAmountsHidden), name]}
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, color: '#fff', fontSize: 12 }}
                      labelStyle={{ color: '#e4e4e7' }}
                    />
                    {chartMode === 'cashflow' ? (
                      <>
                        <Bar dataKey="income" name={labels.income} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={25} isAnimationActive={false} />
                        <Bar dataKey="expense" name={labels.expense} fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={25} isAnimationActive={false} />
                        <Line dataKey="net" name={labels.net} stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} type="monotone" isAnimationActive={false} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="budget" name={labels.available} fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                        <Bar dataKey="expense" name={labels.spent} fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {!isAmountsHidden && overview.cycles.length > 3 && <p className="mt-2 text-[10px] text-zinc-500 sm:hidden">{labels.scrollHint}</p>}
        </div>

        <div className="rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-white"><Layers3 className="h-4 w-4 text-cyan-400" />{effectiveOverviewScope === 'RECENT' ? labels.recent : labels.yearly}</h3>
          <p className="mt-1 text-xs text-zinc-400">{overview.cycles.length} {labels.cycleCount}{overview.cycles.some((cycle) => cycle.isCurrent) ? ' · ' + labels.recentDetail : ''}</p>
          <dl className="mt-5 space-y-3">
            {[
              [labels.totalIncome, overview.income, 'text-emerald-400'],
              [labels.totalExpense, overview.expense, 'text-rose-400'],
              [labels.totalNet, overview.net, overview.net < 0 ? 'text-rose-400' : 'text-indigo-400'],
              [labels.averageExpense, Math.round(overview.averageExpense), 'text-white'],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-3 border-b border-zinc-800 pb-2 last:border-0">
                <dt className="text-xs text-zinc-400">{label}</dt>
                <dd className={'text-right font-mono text-sm font-bold ' + tone}>{formatVND(Number(value), isAmountsHidden)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-zinc-400">{labels.keepRate}: <strong className="text-zinc-200">{isAmountsHidden ? '••••' : overview.retentionRate === null ? labels.noIncomeRate : formatPercent(overview.retentionRate)}</strong></p>
          {!isAmountsHidden && overviewExpenseCategories.length > 0 && (
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <p className="text-[11px] font-bold text-zinc-300">{labels.topExpenses}</p>
              <div className="mt-2 space-y-1.5">
                {overviewExpenseCategories.slice(0, 3).map((category, index) => (
                  <div key={category.name} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate text-zinc-400">{index + 1}. {category.name}</span>
                    <span className="shrink-0 font-mono text-zinc-200">{formatVND(category.amount, isAmountsHidden)}</span>
                  </div>
                ))}
              </div>
              {overviewExpenseCategories.reduce((sum, category) => sum + category.amount, 0) !== overview.expense && (
                <p className="mt-2 text-[10px] text-amber-400">{labels.incompleteExpenses}</p>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-zinc-500">{labels.netDetail}</p>
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-white"><Target className="h-4 w-4 text-indigo-400" />{labels.budget}</h3>
            <p className="mt-1 text-xs text-zinc-400">{labels.budgetDetail}</p>
          </div>
          {selected.budget !== null && (
            <span className="rounded-lg bg-indigo-500/10 px-3 py-1.5 font-mono text-xs font-bold text-indigo-300">
              {labels.available}: {formatVND(selected.budget, isAmountsHidden)}
            </span>
          )}
        </div>
        {selected.budget !== null && (
          <div className="mt-4 grid gap-2 rounded-xl border border-zinc-800 bg-[#18181b] p-3 text-[11px] sm:grid-cols-3">
            <span className="text-zinc-400">{labels.newAllocation}: <strong className="font-mono text-zinc-200">{formatVND(selected.allocation || 0, isAmountsHidden)}</strong></span>
            <span className="text-zinc-400">{labels.opening}: <strong className="font-mono text-zinc-200">{formatVND(selected.opening || 0, isAmountsHidden)}</strong></span>
            <span className="text-zinc-400">{labels.spent}: <strong className="font-mono text-zinc-200">{formatVND(selected.expense, isAmountsHidden)}</strong></span>
          </div>
        )}
        {selected.budget === null && <p className="mt-4 flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="h-4 w-4" />{labels.noHistoricalBudget}</p>}
        {!sortedJars.length ? (
          <p className="mt-5 rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-400">{labels.noJars}</p>
        ) : isAmountsHidden ? (
          <p className="py-10 text-center text-sm text-zinc-400">{labels.hidden}</p>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {sortedJars.map((jar) => {
              const overBudget = jar.budget !== null && jar.spent > jar.budget;
              const used = jar.budget !== null && jar.budget > 0 ? jar.spent / jar.budget : jar.spent > 0 ? 1 : 0;
              return (
                <div key={jar.jarId} className="min-w-0 rounded-xl border border-zinc-800 bg-[#18181b] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: jar.color }} />
                      <span className="truncate text-xs font-bold text-white" title={jar.name}>{jar.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{jar.code}</span>
                    </div>
                    {jar.archived && <span className="shrink-0 text-[10px] text-zinc-500">{labels.archived}</span>}
                  </div>
                  {jar.budget !== null && (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div className={'h-full rounded-full ' + (overBudget ? 'bg-rose-500' : 'bg-indigo-500')} style={{ width: Math.min(100, used * 100) + '%' }} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-zinc-400">{labels.spent}: <strong className={overBudget ? 'font-mono text-rose-400' : 'font-mono text-zinc-200'}>{formatVND(jar.spent, isAmountsHidden)}</strong></span>
                    {jar.budget !== null && <span className="font-mono text-zinc-400">/ {formatVND(jar.budget, isAmountsHidden)}</span>}
                  </div>
                  {jar.budget !== null && (
                    <div className="mt-1 flex justify-between gap-2 text-[10px]">
                      <span className={overBudget ? 'font-bold text-rose-400' : 'text-zinc-500'}>{overBudget ? labels.overspent : labels.remaining}</span>
                      <span className={overBudget ? 'font-mono font-bold text-rose-400' : 'font-mono text-cyan-400'}>{formatVND(overBudget ? jar.spent - jar.budget : jar.remaining || 0, isAmountsHidden)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isAmountsHidden && carryoverJars.length > 0 && (
          <details className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
              {labels.carryoverSources}<ChevronDown className="h-4 w-4" />
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {carryoverJars.map((jar) => (
                <div key={jar.jarId} className="rounded-lg border border-zinc-800 bg-[#121214] p-3">
                  <p className="text-xs font-bold text-white">{jar.code} · {jar.name}</p>
                  {jar.closingCarryovers.filter((source) => source.amount > 0).map((source, index) => (
                    <div key={source.sourceCycleStart + '-' + index} className="mt-2 flex items-start justify-between gap-3 text-[10px] text-zinc-400">
                      <span>{source.sourceJarName ? source.sourceJarName + ' · ' : ''}{cycleLabel(source.sourceCycleStart, source.sourceCycleEnd)}</span>
                      <span className="shrink-0 font-mono font-bold text-cyan-300">{formatVND(source.amount, isAmountsHidden)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <h3 className="text-sm font-extrabold text-white">{labels.categories}</h3>
          <p className="mb-4 mt-1 text-xs text-zinc-400">{labels.categoryDetail}</p>
          <CategoryList categories={expenseCategories} total={Math.max(selected.expense, recordedExpense)} emptyLabel={labels.uncategorizedExpense} countLabel={labels.transactions} otherLabel={labels.other} isAmountsHidden={isAmountsHidden} />
          {!isAmountsHidden && recordedExpense !== selected.expense && (recordedExpense > 0 || selected.expense > 0) && (
            <p className="mt-4 text-[11px] text-amber-400">{labels.incompleteExpenses}</p>
          )}
        </div>
        <div className="min-w-0 rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <h3 className="text-sm font-extrabold text-white">{labels.sources}</h3>
          <p className="mb-4 mt-1 text-xs text-zinc-400">{labels.sourceDetail}</p>
          <CategoryList categories={incomeCategories} total={recordedIncome} emptyLabel={labels.noIncomeTransactions} countLabel={labels.transactions} otherLabel={labels.other} isAmountsHidden={isAmountsHidden} />
          {!isAmountsHidden && recordedIncome !== selected.income && selected.income > 0 && (
            <p className="mt-4 text-[11px] text-amber-400">{labels.incompleteSources}</p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-white"><CalendarRange className="h-4 w-4 text-indigo-400" />{labels.history}</h3>
            <p className="mt-1 text-xs text-zinc-400">{labels.historyDetail}</p>
          </div>
          <span className="text-[10px] text-zinc-500">{labels.cycle}: {resetDay}</span>
        </div>
        {!historySummaries.length ? (
          <p className="mt-5 rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-400">{labels.noHistory}</p>
        ) : (
          <>
            <div className="mt-4 space-y-2 md:hidden">
              {historySummaries.map((summary) => {
                const calculatedCycle = completedById.get(summary.id);
                const expense = calculatedCycle?.expense ?? summary.expense;
                const net = summary.income - expense;
                return (
                  <div key={summary.id} className="rounded-xl border border-zinc-800 bg-[#18181b] p-3 text-xs">
                    <button
                      type="button"
                      onClick={() => { setSelectedCycleId(summary.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="font-bold text-indigo-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >{cycleLabel(summary.cycleStart, summary.cycleEnd)}</button>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div><span className="text-zinc-400">{labels.income}</span>{renderIncomeEditor(summary, 'mobile')}</div>
                      <div className="text-right"><span className="text-zinc-400">{labels.expense}</span><p className="font-mono text-rose-400">{formatVND(expense, isAmountsHidden)}</p></div>
                      <div><span className="text-zinc-400">{labels.net}</span><p className={'font-mono font-bold ' + (net < 0 ? 'text-rose-400' : 'text-emerald-400')}>{formatVND(net, isAmountsHidden)}</p></div>
                      <div className="text-right"><span className="text-zinc-400">{labels.carryover}</span><p className="font-mono text-cyan-400">{calculatedCycle?.carryover == null ? '—' : formatVND(calculatedCycle.carryover, isAmountsHidden)}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-zinc-800 md:block">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="bg-[#18181b] text-[10px] uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th scope="col" className="px-3 py-3">{labels.cycle}</th>
                    <th scope="col" className="px-3 py-3 text-right">{labels.income}</th>
                    <th scope="col" className="px-3 py-3 text-right">{labels.expense}</th>
                    <th scope="col" className="px-3 py-3 text-right">{labels.net}</th>
                    <th scope="col" className="px-3 py-3 text-right">{labels.carryover}</th>
                    <th scope="col" className="px-3 py-3 text-right">{labels.count}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {historySummaries.map((summary) => {
                    const calculatedCycle = completedById.get(summary.id);
                    const expense = calculatedCycle?.expense ?? summary.expense;
                    const net = summary.income - expense;
                    return (
                      <tr key={summary.id} className="text-zinc-300">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => { setSelectedCycleId(summary.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="font-semibold text-white underline decoration-indigo-500/40 underline-offset-4 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >{cycleLabel(summary.cycleStart, summary.cycleEnd)}</button>
                        </td>
                        <td className="px-3 py-3 text-right">{renderIncomeEditor(summary, 'desktop')}</td>
                        <td className="px-3 py-3 text-right font-mono text-rose-400">{formatVND(expense, isAmountsHidden)}</td>
                        <td className={'px-3 py-3 text-right font-mono font-bold ' + (net < 0 ? 'text-rose-400' : 'text-emerald-400')}>{formatVND(net, isAmountsHidden)}</td>
                        <td className="px-3 py-3 text-right font-mono text-cyan-400">{calculatedCycle?.carryover == null ? '—' : formatVND(calculatedCycle.carryover, isAmountsHidden)}</td>
                        <td className="px-3 py-3 text-right text-zinc-400">{calculatedCycle?.transactionCount ?? summary.transactionCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
