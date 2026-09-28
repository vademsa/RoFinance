import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Jar, MonthlyCycleSummary, Transaction } from '../types';
import { formatVND, formatShortVND } from '../utils/formatters';
import { getDisplayCurrencyCode, getRuntimePreferences } from '../lib/preferences';
import { AlertTriangle, BarChart3, CalendarRange, Check, Pencil, PieChart as PieIcon, TrendingUp, X } from 'lucide-react';
import {
  formatCycleDate,
  getCycleTransactions,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  parseLocalDate,
} from '../utils/monthlyCycle';
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
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<number | ''>('');
  const [selectedCycleId, setSelectedCycleId] = useState<string>('CURRENT');
  const isEnglish = getRuntimePreferences().language === 'en';
  const currentCycleStart = getFinancialCycleStart(new Date(), resetDay);
  const currentCycleEnd = getNextFinancialCycleStart(currentCycleStart, resetDay);
  const currentCycleTransactions = getCycleTransactions(
    transactions,
    currentCycleStart,
    currentCycleEnd,
  );
  const selectedSummary = monthlySummaries.find((summary) => summary.id === selectedCycleId);
  const historicalStart = selectedSummary ? parseLocalDate(selectedSummary.cycleStart) : null;
  const historicalEndInclusive = selectedSummary ? parseLocalDate(selectedSummary.cycleEnd) : null;
  const selectedCycleStart = historicalStart || currentCycleStart;
  const selectedCycleEnd = historicalEndInclusive
    ? new Date(
        historicalEndInclusive.getFullYear(),
        historicalEndInclusive.getMonth(),
        historicalEndInclusive.getDate() + 1,
      )
    : currentCycleEnd;
  const selectedCycleTransactions = selectedSummary
    ? getCycleTransactions(transactions, selectedCycleStart, selectedCycleEnd)
    : currentCycleTransactions;
  const selectedIncome = selectedSummary?.income ?? monthlyIncome;
  const selectedExpenseByJar = selectedCycleTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce<Record<string, number>>((result, transaction) => {
      result[transaction.jarId] = (result[transaction.jarId] || 0) + transaction.amount;
      return result;
    }, {});
  const selectedExpense = selectedSummary?.expense
    ?? Object.values(selectedExpenseByJar).reduce((sum, amount) => sum + amount, 0);
  const selectedCarryover = selectedSummary?.carriedForward
    ?? jars.reduce((sum, jar) => sum + Math.max(0, jar.targetBudget - jar.currentSpent), 0);

  // Data for Jar Allocation vs Spent Donut/Pie Chart
  const activeJarIds = new Set(jars.map((jar) => jar.id));
  const historicalColors = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#8b5cf6', '#84cc16'];
  const jarAllocationData = selectedSummary?.jarBreakdown
    ? selectedSummary.jarBreakdown.map((snapshot, index) => {
        const savedJar = jarRegistry.find((jar) => jar.id === snapshot.jarId);
        return {
          name: snapshot.jarName,
          code: snapshot.jarCode,
          percentage: savedJar?.percentage,
          budget: snapshot.availableBudget,
          spent: snapshot.spent,
          color: savedJar?.color || historicalColors[index % historicalColors.length],
          archived: !activeJarIds.has(snapshot.jarId),
        };
      })
    : jarRegistry
        .filter((jar) => activeJarIds.has(jar.id) || (selectedExpenseByJar[jar.id] || 0) > 0)
        .map((jar) => {
          const archived = !activeJarIds.has(jar.id);
          const spent = selectedExpenseByJar[jar.id] || 0;
          return {
            name: jar.name,
            code: jar.code,
            percentage: archived ? undefined : jar.percentage,
            budget: archived ? spent : jar.targetBudget,
            spent,
            color: jar.color,
            archived,
          };
        });

  // Data for Category breakdown
  const categoryMap: Record<string, number> = {};
  selectedCycleTransactions
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });

  const categoryData = Object.entries(categoryMap).map(([category, amount]) => ({
    category,
    amount,
  }));

  const sortedSummaries = [...monthlySummaries]
    .sort((a, b) => a.cycleStart.localeCompare(b.cycleStart));
  const monthlyCashflowData = [
    ...sortedSummaries.slice(-4).map((summary) => ({
      month: summary.cycleStart.slice(5).replace('-', '/'),
      income: summary.income,
      expense: summary.expense,
    })),
    {
      month: isEnglish ? 'Current' : 'Hiện tại',
      income: monthlyIncome,
      expense: currentCycleTransactions
        .filter((transaction) => transaction.type === 'expense')
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    },
  ];

  return (
    <div className="space-y-8 text-zinc-100">
      {/* Title */}
      <div className="bg-[#121214] p-6 rounded-[28px] border border-zinc-800 shadow-xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <span>Biểu Đồ Thống Kê & Dòng Tiền Bento</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Trực quan hóa tỷ lệ phân bổ 7 hũ và xu hướng thu chi thực tế theo thời gian
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
          <CalendarRange className="h-5 w-5 text-indigo-300" />
          <div>
            <label htmlFor="analytics-cycle" className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Chu kỳ thống kê</label>
            <select
              id="analytics-cycle"
              value={selectedCycleId}
              onChange={(event) => setSelectedCycleId(event.target.value)}
              className="mt-1 block min-w-52 rounded-lg border border-indigo-500/20 bg-[#121214] px-2.5 py-1.5 text-xs font-black text-white outline-none focus:border-indigo-500"
            >
              <option value="CURRENT">
                Hiện tại: {formatCycleDate(currentCycleStart, isEnglish ? 'en' : 'vi')} – {formatCycleDate(new Date(currentCycleEnd.getFullYear(), currentCycleEnd.getMonth(), currentCycleEnd.getDate() - 1), isEnglish ? 'en' : 'vi')}
              </option>
              {[...monthlySummaries]
                .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))
                .map((summary) => (
                  <option key={summary.id} value={summary.id}>{summary.cycleStart} – {summary.cycleEnd}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Thu nhập kỳ chọn</p>
          <p className="mt-1 font-mono text-lg font-black text-emerald-200">{formatVND(selectedIncome, isAmountsHidden)}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Chi tiêu kỳ chọn</p>
          <p className="mt-1 font-mono text-lg font-black text-rose-200">{formatVND(selectedExpense, isAmountsHidden)}</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Dư chuyển sang kỳ sau</p>
          <p className="mt-1 font-mono text-lg font-black text-cyan-200">{formatVND(selectedCarryover, isAmountsHidden)}</p>
        </div>
      </div>

      {selectedCarryover > 0 && (
        <div className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
          <h3 className="text-sm font-black text-cyan-200">Chi tiết tiền dư theo kỳ nguồn</h3>
          <p className="mt-1 text-xs text-cyan-100/70">Mỗi khoản bên dưới giữ nguyên kỳ phát sinh, kể cả khi được chuyển tiếp qua nhiều tháng.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(selectedSummary?.jarBreakdown || jars.map((jar) => ({
              jarId: jar.id,
              jarCode: jar.code,
              jarName: jar.name,
              closingCarryovers: [...(jar.carryovers || []), ...(jar.transferredIn || [])],
            }))).filter((item) => item.closingCarryovers.length > 0).map((item) => (
              <div key={item.jarId} className="rounded-2xl border border-cyan-500/15 bg-[#121214] p-3">
                <div className="text-xs font-black text-white">{item.jarCode} · {item.jarName}</div>
                <div className="mt-2 space-y-1.5">
                  {item.closingCarryovers.map((source, index) => (
                    <div key={`${source.sourceCycleStart}-${source.sourceCycleEnd}-${source.sourceJarId || index}`} className="flex items-center justify-between gap-3 text-[10px] text-zinc-400">
                      <span>
                        {source.sourceJarName ? `${source.sourceJarName} · ` : ''}
                        {source.sourceCycleStart} – {source.sourceCycleEnd}
                      </span>
                      <span className="font-mono font-bold text-cyan-300">{formatVND(source.amount, isAmountsHidden)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Jar Allocation vs Actual Spent Donut Chart */}
        <div className="bg-[#121214] p-6 rounded-[28px] border border-zinc-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
              <PieIcon className="w-4 h-4 text-indigo-400" />
              <span>Tỷ Lệ Phân Bổ Hũ Ngân Sách</span>
            </h3>
            <span className="text-xs text-zinc-500 font-mono">Đơn vị: {getDisplayCurrencyCode()}</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={jarAllocationData}
                  dataKey="budget"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {jarAllocationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatVND(value, isAmountsHidden), 'Hạn mức']}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-800 text-xs">
            {jarAllocationData.map((item) => (
              <div key={`${item.code}-${item.name}`} className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: item.color }} />
                <span className="font-bold text-zinc-200 truncate">{item.code}</span>
                <span className="text-zinc-500">
                  {item.percentage !== undefined ? `(${item.percentage}%)` : item.archived ? '(đã lưu)' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Monthly Income vs Expense Area Chart */}
        <div className="bg-[#121214] p-6 rounded-[28px] border border-zinc-800 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Thu Nhập vs Chi Tiêu Theo Chu Kỳ</span>
            </h3>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyCashflowData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                <YAxis tickFormatter={(v) => formatShortVND(v, isAmountsHidden)} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                <Tooltip
                  formatter={(val: number) => [formatVND(val, isAmountsHidden), '']}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />

                <Legend wrapperStyle={{ color: '#a1a1aa' }} />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Thu Nhập"
                  stroke="#10B981"
                  fillOpacity={1}
                  fill="url(#colorIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Chi Tiêu"
                  stroke="#EF4444"
                  fillOpacity={1}
                  fill="url(#colorExpense)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Category Spending Breakdown Bar Chart */}
      <div className="bg-[#121214] p-6 rounded-[28px] border border-zinc-800 shadow-xl">
        <h3 className="text-sm font-extrabold text-white mb-4 flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span>Cơ Cấu Chi Tiêu Thực Tế Theo Danh Mục</span>
        </h3>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData}>
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
              <YAxis tickFormatter={(v) => formatShortVND(v)} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
              <Tooltip
                formatter={(val: number) => [formatVND(val), 'Tổng chi']}
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
              />
              <Bar dataKey="amount" name="Số tiền" fill="#6366F1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#121214] p-6 rounded-[28px] border border-zinc-800 shadow-xl">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
              <CalendarRange className="w-4 h-4 text-emerald-400" />
              <span>Lịch Sử Tổng Kết Chu Kỳ</span>
            </h3>
            <p className="mt-1 text-xs text-zinc-500">Giao dịch không bị xoá sau khi reset.</p>
          </div>
          <span className="text-[10px] font-semibold text-zinc-500">Ngày reset: {resetDay} hàng tháng</span>
        </div>

        {sortedSummaries.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs text-zinc-500">
            Tổng kết đầu tiên sẽ xuất hiện sau ngày reset tiếp theo.
          </div>
        ) : (
          <>
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/80">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p><strong className="text-amber-200">Dòng tiền ròng = Thu nhập − Chi tiêu.</strong> Số âm là bội chi trong chu kỳ, không phải số dư tài khoản ngân hàng. Bạn có thể sửa thu nhập của tổng kết cũ nếu dữ liệu trước đây bị ghi nhận thiếu.</p>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-[#18181b] text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Chu kỳ</th>
                  <th className="px-4 py-3 text-right">Thu nhập</th>
                  <th className="px-4 py-3 text-right">Chi tiêu</th>
                  <th className="px-4 py-3 text-right">Dòng tiền ròng</th>
                  <th className="px-4 py-3 text-right">Dư chuyển tiếp</th>
                  <th className="px-4 py-3 text-right">Giao dịch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {[...sortedSummaries].reverse().map((summary) => {
                  const netCashflow = summary.income - summary.expense;
                  const isEditing = editingSummaryId === summary.id;
                  return (
                  <tr key={summary.id} className="text-zinc-300">
                    <td className="px-4 py-3 font-semibold text-white">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCycleId(summary.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="rounded-lg text-left underline decoration-indigo-500/30 underline-offset-4 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                      >
                        {summary.cycleStart} – {summary.cycleEnd}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-400">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <label htmlFor={`summary-income-${summary.id}`} className="sr-only">Thu nhập chu kỳ {summary.cycleStart}</label>
                          <CurrencyInput
                            id={`summary-income-${summary.id}`}
                            value={incomeDraft}
                            onValueChange={setIncomeDraft}
                            min={0}
                            className="w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-right font-mono text-xs text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <button
                            type="button"
                            aria-label="Lưu thu nhập chu kỳ"
                            onClick={() => {
                              if (incomeDraft === '') return;
                              onUpdateSummaryIncome(summary.id, Math.max(0, incomeDraft));
                              setEditingSummaryId(null);
                            }}
                            className="cursor-pointer rounded-lg p-1.5 text-emerald-400 transition-colors hover:bg-emerald-500/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                          ><Check className="h-4 w-4" /></button>
                          <button
                            type="button"
                            aria-label="Huỷ sửa thu nhập"
                            onClick={() => setEditingSummaryId(null)}
                            className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                          ><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isAmountsHidden}
                          aria-label={`Sửa thu nhập chu kỳ ${summary.cycleStart}`}
                          onClick={() => {
                            setEditingSummaryId(summary.id);
                            setIncomeDraft(summary.income);
                          }}
                          className="group ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-default"
                        >
                          <span>{formatVND(summary.income, isAmountsHidden)}</span>
                          {!isAmountsHidden && <Pencil className="h-3 w-3 text-zinc-600 transition-colors group-hover:text-indigo-400" />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-400">{formatVND(summary.expense, isAmountsHidden)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${netCashflow < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      <div>{formatVND(netCashflow, isAmountsHidden)}</div>
                      {!isAmountsHidden && (
                        <span className="mt-0.5 block font-sans text-[9px] font-bold uppercase tracking-wider">
                          {netCashflow < 0 ? 'Bội chi' : 'Thặng dư'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-cyan-300">
                      {summary.carriedForward === undefined
                        ? '—'
                        : formatVND(summary.carriedForward, isAmountsHidden)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-500">{summary.transactionCount}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
};
