import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, ChevronLeft, ChevronRight, Pencil, Plus, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BankAccount, Jar, MonthlyCycleSummary, Transaction, TransactionCategory } from '../types';
import { buildAnalyticsCycles } from '../utils/analytics';
import { deduplicateBankAccounts, getBankAccountBalance } from '../utils/bankAccounts';
import { dashboardDate, getDashboardCalendar, getDashboardDays, getDashboardPeriods, getDashboardTransactions, isDashboardJarTransaction, type DashboardScope } from '../utils/dashboard';
import { parseLocalDate, toLocalDateKey } from '../utils/monthlyCycle';
import { formatDateVI, formatShortVND, formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { CategoryIcon } from './CategoryIcon';
import { findTransactionCategory } from '../constants/categories';
import { localizeText } from './TranslationLayer';

interface OverviewDashboardProps {
  jars: Jar[]; jarRegistry: Jar[]; transactions: Transaction[]; bankAccounts: BankAccount[];
  summaries: MonthlyCycleSummary[]; monthlyIncome: number; resetDay: number; customCategories: TransactionCategory[];
  isAmountsHidden: boolean; onManageJars: (jarId?: string) => void; onManageAccounts: () => void;
  onAddTransaction: (date: string, type: 'income' | 'expense') => void; onEditTransaction: (transaction: Transaction) => void;
}

const card = 'min-w-0 rounded-2xl border border-zinc-800 bg-[#121214]';
const button = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
const select = 'min-h-11 min-w-0 rounded-xl border border-zinc-700 bg-[#121214] px-3 py-2 text-base text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-xs';
const PAGE_SIZE = 5;

export function OverviewDashboard({ jars, jarRegistry, transactions, bankAccounts, summaries, monthlyIncome, resetDay, customCategories,
  isAmountsHidden, onManageJars, onManageAccounts, onAddTransaction, onEditTransaction }: OverviewDashboardProps) {
  const language = getRuntimePreferences().language;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const today = toLocalDateKey(new Date());
  const [periodId, setPeriodId] = useState('CURRENT');
  const [scope, setScope] = useState<DashboardScope>('all');
  const [account, setAccount] = useState('ALL');
  const [dayDraft, setDayDraft] = useState(today);
  const [monthDraft, setMonthDraft] = useState(today.slice(0, 7));
  const [pageDraft, setPageDraft] = useState({ key: '', page: 0 });
  const periods = useMemo(() => getDashboardPeriods(transactions, summaries, resetDay), [transactions, summaries, resetDay, today]);
  const period = periods.find(row => periodId === 'CURRENT' ? row.isCurrent : row.id === periodId) || periods.find(row => row.isCurrent)!;
  const accounts = useMemo(() => deduplicateBankAccounts(bankAccounts), [bankAccounts]);
  const selectedAccount = account === 'ALL' || account === 'NONE' || accounts.some(row => `account:${row.id}` === account) ? account : 'ALL';
  const filtered = useMemo(() => getDashboardTransactions(transactions, period, scope,
    selectedAccount === 'ALL' ? undefined : selectedAccount === 'NONE' ? '' : selectedAccount.slice(8)), [transactions, period, scope, selectedAccount]);
  const days = useMemo(() => getDashboardDays(filtered, period), [filtered, period]);
  const byDate = new Map(days.map(day => [day.date, day]));
  const income = days.reduce((sum, day) => sum + day.income, 0);
  const expense = days.reduce((sum, day) => sum + day.expense, 0);
  const selectedDate = dayDraft >= period.start && dayDraft <= period.end ? dayDraft : period.end < today ? period.end : today;
  const month = monthDraft >= period.start.slice(0, 7) && monthDraft <= period.end.slice(0, 7) ? monthDraft : selectedDate.slice(0, 7);
  const selectedDay = byDate.get(selectedDate);
  const dailyTransactions = selectedDay?.transactions || [];
  const pageKey = `${period.id}/${selectedDate}/${scope}/${selectedAccount}`;
  const pages = Math.max(1, Math.ceil(dailyTransactions.length / PAGE_SIZE));
  const page = Math.min(pageDraft.key === pageKey ? pageDraft.page : 0, pages - 1);
  const analyticsCycles = useMemo(() => buildAnalyticsCycles({ jars, jarRegistry, transactions, summaries, monthlyIncome, resetDay }),
    [jars, jarRegistry, transactions, summaries, monthlyIncome, resetDay, today]);
  // Only jar budget snapshots are reused. AnalyticsCycle.income is an allocation
  // baseline, NOT the transaction income displayed by this dashboard.
  const budgetCycle = analyticsCycles.find(row => row.start === period.start && row.end === period.end);
  const budgetRows = budgetCycle?.jars || [];
  const budgetsKnown = budgetRows.length > 0 && budgetRows.every(row => row.budget !== null);
  const remaining = budgetsKnown ? budgetRows.reduce((sum, row) => sum + row.budget! - row.spent, 0) : null;
  const bankBalance = accounts.reduce((sum, row) => sum + getBankAccountBalance(jars, row, transactions), 0);
  const needsReconciliation = accounts.some(row => row.balanceReconciled === false);
  const monthDate = parseLocalDate(`${month}-01`)!;
  const nextCycle = parseLocalDate(period.end)!; nextCycle.setDate(nextCycle.getDate() + 1);
  const nextCycleStart = toLocalDateKey(nextCycle);
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const fullDate = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseLocalDate(date)!);
  const dateRange = `${formatDateVI(period.start)} – ${formatDateVI(period.end)}`;
  const changeDate = (date: string) => { setDayDraft(date); setMonthDraft(date.slice(0, 7)); setPageDraft({ key: '', page: 0 }); };
  const changePeriod = (id: string) => {
    setPeriodId(id);
    const next = periods.find(row => id === 'CURRENT' ? row.isCurrent : row.id === id)!;
    const date = next.isCurrent ? today : next.end;
    changeDate(date);
  };
  const moveMonth = (offset: number) => {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    setMonthDraft(toLocalDateKey(next).slice(0, 7));
  };
  const chartData = days.map(day => ({ ...day, label: `${day.date.slice(8)}/${day.date.slice(5, 7)}` }));
  const needsAttention = (row: typeof budgetRows[number]) => row.budget !== null && row.spent > 0 && row.spent >= row.budget;
  const visibleJars = [...budgetRows].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))).slice(0, 4);

  return <div data-no-translate="true" className="space-y-4" aria-label={t('Tổng quan tài chính', 'Financial overview')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">{t('Tổng quan', 'Overview')}</h1>
        <p className="mt-1 text-xs text-zinc-400">{t('Tình hình thu chi trong chu kỳ của bạn', 'Your recorded cash flow this financial cycle')}</p></div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <label className="sr-only" htmlFor="dashboard-cycle">{t('Chu kỳ tổng quan', 'Overview cycle')}</label>
        <select id="dashboard-cycle" className={select + ' w-full sm:w-auto sm:max-w-72'} value={period.isCurrent ? 'CURRENT' : period.id} onChange={event => changePeriod(event.target.value)}>
          {periods.map(row => <option key={row.id} value={row.isCurrent ? 'CURRENT' : row.id}>{row.isCurrent ? t('Hiện tại · ', 'Current · ') : ''}{formatDateVI(row.start)} – {formatDateVI(row.end)}</option>)}
        </select>
        <button type="button" disabled={selectedDate > today} title={formatDateVI(selectedDate)} className={button + ' flex-1 border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500 sm:flex-none'} onClick={() => onAddTransaction(selectedDate, 'expense')}><Plus size={15} aria-hidden="true"/>{t('Ghi chi', 'Add expense')}</button>
        <button type="button" disabled={selectedDate > today} title={formatDateVI(selectedDate)} className={button + ' flex-1 sm:flex-none'} onClick={() => onAddTransaction(selectedDate, 'income')}><Plus size={15} aria-hidden="true"/>{t('Ghi thu', 'Add income')}</button>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label={t('Phạm vi giao dịch', 'Transaction scope')} className="flex max-w-full flex-wrap gap-1.5">
        {(['all', 'jars', 'outside'] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => { setScope(value); setPageDraft({ key: '', page: 0 }); }}
          className={button + (scope === value ? ' border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500' : '')}>{value === 'all' ? t('Tất cả', 'All') : value === 'jars' ? t('Trong hũ', 'Inside jars') : t('Ngoài hũ', 'Outside jars')}</button>)}
      </div>
      <label className="flex w-full items-center gap-2 text-xs text-zinc-400 sm:w-auto"><Building2 size={16} aria-hidden="true"/><span className="sr-only">{t('Tài khoản lọc giao dịch', 'Transaction account filter')}</span>
        <select className={select + ' w-full sm:max-w-64'} value={selectedAccount} onChange={event => { setAccount(event.target.value); setPageDraft({ key: '', page: 0 }); }}>
          <option value="ALL">{t('Tất cả tài khoản', 'All accounts')}</option>
          <option value="NONE">{t('Tiền mặt / Chưa ghi tài khoản', 'Cash / Account not recorded')}</option>
          {accounts.map(row => <option key={row.id} value={`account:${row.id}`}>{row.bankName} · {row.accountNumber.slice(-4)}</option>)}
        </select></label>
    </div>

    <section aria-label={t('Tóm tắt chu kỳ', 'Cycle summary')} className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      <div className={card + ' p-3 sm:p-4'}><p className="flex items-center gap-2 text-xs text-zinc-400"><ArrowDownLeft size={16} className="text-emerald-400" aria-hidden="true"/>{t('Thu đã ghi trong kỳ', 'Recorded income')}</p>
        <p className="mt-2 break-all font-mono text-lg font-black text-emerald-400 sm:text-xl" data-metric="income">{isAmountsHidden ? formatVND(0, true) : '+' + formatVND(income)}</p></div>
      <div className={card + ' p-3 sm:p-4'}><p className="flex items-center gap-2 text-xs text-zinc-400"><ArrowUpRight size={16} className="text-rose-400" aria-hidden="true"/>{t('Chi đã ghi trong kỳ', 'Recorded expenses')}</p>
        <p className="mt-2 break-all font-mono text-lg font-black text-rose-400 sm:text-xl" data-metric="expense">{isAmountsHidden ? formatVND(0, true) : '−' + formatVND(expense)}</p></div>
      <div className={card + ' col-span-2 p-3 sm:p-4 lg:col-span-1'}><p className="flex items-center gap-2 text-xs text-zinc-400"><Wallet size={16} className="text-indigo-400" aria-hidden="true"/>{t('Hạn mức hũ còn lại', 'Remaining jar budget')}</p>
        <p className="mt-2 break-all font-mono text-lg font-black text-indigo-300 sm:text-xl" data-metric="budget">{isAmountsHidden ? formatVND(0, true) : remaining === null ? '—' : formatVND(remaining)}</p>
        <p className="mt-1 text-[10px] text-zinc-400">{remaining === null ? t('Chưa có ảnh chụp hạn mức của chu kỳ này.', 'No saved budget snapshot for this cycle.') : t('Toàn bộ hũ trong chu kỳ, không theo bộ lọc giao dịch.', 'All jars in this cycle; not affected by transaction filters.')}</p></div>
    </section>
    <p className="text-[11px] leading-relaxed text-zinc-400">{t('Thu/chi chỉ tính giao dịch đã ghi, không tính phân bổ hạn mức hoặc chuyển tiền. Dữ liệu cũ thiếu giao dịch chi tiết sẽ không được tự suy diễn.', 'Income/expenses use recorded transactions only, excluding budget allocation and transfers. Missing historical transaction details are not inferred.')}</p>

    <button type="button" onClick={onManageAccounts} className={card + ' flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:border-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-4'}>
      <Building2 size={18} className="shrink-0 text-indigo-300" aria-hidden="true"/>
      <span className="min-w-0 flex-1"><span className="block text-xs text-zinc-200">{t('Số dư tất cả tài khoản hiện tại', 'Current balance of all accounts')}</span>
        <span className="mt-0.5 block text-[10px] text-zinc-400">{t('Tách biệt hạn mức hũ và chu kỳ đang xem', 'Separate from jar budgets and the cycle being viewed')}{needsReconciliation ? t(' · Có số dư cần xác nhận', ' · Some balances need confirmation') : ''}</span></span>
      <span className="max-w-[48%] text-right"><strong className="block break-all font-mono text-sm text-white" data-metric="bank">{formatVND(bankBalance, isAmountsHidden)}</strong><span className="text-[10px] text-zinc-400">{accounts.length} {t('tài khoản', accounts.length === 1 ? 'account' : 'accounts')}</span></span>
      <ChevronRight size={16} className="shrink-0 text-zinc-400" aria-hidden="true"/>
    </button>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <section className={card + ' p-3 sm:p-4'} aria-label={t('Thu chi theo ngày', 'Daily cash flow')}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-white">{t('Thu chi theo ngày', 'Daily cash flow')}</h2>
          {!isAmountsHidden && <div className="flex gap-3 text-[11px]"><span className="text-emerald-400">+ {t('Thu', 'Income')}</span><span className="text-rose-400">− {t('Chi', 'Expenses')}</span></div>}</div>
        {isAmountsHidden ? <p className="flex h-56 items-center justify-center text-center text-xs text-zinc-400">{t('Tắt chế độ ẩn tiền để xem biểu đồ.', 'Show amounts to view this chart.')}</p>
          : <><div role="img" aria-label={t('Biểu đồ thu và chi theo từng ngày của chu kỳ', 'Income and expense chart for each day of the cycle')} className="mt-3 h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} accessibilityLayer={false} aria-hidden="true" margin={{ top: 10, right: 2, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#71717a" strokeOpacity={0.3} vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20} tick={{ fill: 'var(--overview-chart-text)', fontSize: 11 }}/>
              <YAxis axisLine={false} tickLine={false} tickFormatter={value => formatShortVND(Number(value))} width={72} tick={{ fill: 'var(--overview-chart-text)', fontSize: 10 }}/>
              <Tooltip cursor={{ fill: 'rgba(99,102,241,0.08)' }} content={({ active, payload }) => {
                const day = payload?.[0]?.payload as typeof chartData[number] | undefined;
                return active && day ? <div className="rounded-xl border border-zinc-700 bg-[#18181b] p-3 text-xs shadow-xl"><p className="font-semibold text-white">{formatDateVI(day.date)}</p><p className="mt-1 text-emerald-400">{t('Thu', 'Income')}: +{formatVND(day.income)}</p><p className="mt-1 text-rose-400">{t('Chi', 'Expenses')}: −{formatVND(day.expense)}</p><p className="mt-1 text-zinc-400">{day.count} {t('giao dịch', 'transactions')}</p></div> : null;
              }}/>
              <Bar dataKey="income" fill="#34d399" radius={[2, 2, 0, 0]} isAnimationActive={false}/><Bar dataKey="expense" fill="#fb7185" radius={[2, 2, 0, 0]} isAnimationActive={false}/>
            </BarChart></ResponsiveContainer>
          </div>{filtered.length === 0 && <p className="mt-1 text-center text-[11px] text-zinc-400">{t('Chưa có giao dịch thu/chi phù hợp bộ lọc.', 'No recorded income/expenses match these filters.')}</p>}</>}
      </section>

      <section className={card + ' hidden p-3 sm:p-4 lg:block'} aria-label={t('Hũ tài chính thu gọn', 'Compact financial jars')}>
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-white">{t('Hũ tài chính', 'Financial jars')}</h2>
          <button type="button" className={button + ' border-0 px-2 text-indigo-300'} onClick={() => onManageJars()}>{t('Quản lý hũ', 'Manage jars')}<ChevronRight size={14} aria-hidden="true"/></button></div>
        <p className="text-[10px] text-zinc-400">{period.isCurrent ? t('Hạn mức, không phải số dư ngân hàng', 'Spending limits, not bank balances') : t('Ảnh chụp hạn mức chu kỳ đang xem', 'Budget snapshot for the selected cycle')}</p>
        <ul className="mt-2 divide-y divide-zinc-800">
          {visibleJars.map(row => {
            const rest = row.budget === null ? null : row.budget - row.spent;
            const ratio = row.budget && row.budget > 0 ? Math.min(100, row.spent / row.budget * 100) : row.spent > 0 ? 100 : 0;
            const content = <><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-zinc-200"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true"/><span className="break-words">{localizeText(row.name, language)}</span></span>
              <span className="shrink-0 font-mono text-xs text-white">{t('Còn', 'Left')} {isAmountsHidden ? formatVND(0, true) : rest === null ? '—' : formatVND(rest)}</span>
              {!isAmountsHidden && row.budget !== null && <span aria-hidden="true" className="col-span-2 h-1 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full rounded-full" style={{ width: `${ratio}%`, background: rest !== null && rest < 0 ? '#fb7185' : row.color }}/></span>}
              {!isAmountsHidden && rest !== null && rest < 0 && <span className="col-span-2 text-[10px] text-rose-400">{t('Vượt hạn mức', 'Over budget')}</span>}</>;
            return <li key={row.jarId}>{period.isCurrent ? <button type="button" onClick={() => onManageJars(row.jarId)} className="grid min-h-11 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-zinc-800/40">{content}</button>
              : <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2">{content}</div>}</li>;
          })}
        </ul>
        {budgetRows.length === 0 && <p className="py-8 text-center text-xs text-zinc-400">{t('Chưa có ảnh chụp hũ của chu kỳ này.', 'No jar snapshot for this cycle.')}</p>}
        {budgetRows.length > 4 && <p className="mt-2 text-[10px] text-zinc-400">{t(`Hiển thị 4/${budgetRows.length} hũ · mở Quản lý hũ để xem cấu hình hiện tại.`, `Showing 4/${budgetRows.length} jars · Manage jars opens the current configuration.`)}</p>}
      </section>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className={card + ' overflow-hidden'} aria-label={t('Lịch giao dịch', 'Transaction calendar')}>
        <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 sm:px-4"><h2 className="text-sm font-bold text-white">{t('Lịch giao dịch', 'Transaction calendar')}</h2>
          <div className="flex min-w-0 items-center gap-1"><button type="button" className={button + ' min-w-11 px-2'} aria-label={t('Tháng trước trong chu kỳ', 'Previous month in cycle')} disabled={month <= period.start.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={16} aria-hidden="true"/></button>
            <span aria-live="polite" className="min-w-0 text-center text-xs font-semibold text-zinc-200">{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthDate)}</span>
            <button type="button" className={button + ' min-w-11 px-2'} aria-label={t('Tháng sau trong chu kỳ', 'Next month in cycle')} disabled={month >= period.end.slice(0, 7)} onClick={() => moveMonth(1)}><ChevronRight size={16} aria-hidden="true"/></button></div>
        </header>
        <div className="grid grid-cols-7 border-b border-zinc-800 text-center text-[10px] text-zinc-400">{(language === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']).map(day => <span key={day} className="py-2">{day}</span>)}</div>
        <div className="grid grid-cols-7">
          {getDashboardCalendar(month).map(date => {
            const day = byDate.get(date);
            const inMonth = date.startsWith(month), inPeriod = date >= period.start && date <= period.end;
            const selectable = inMonth && inPeriod;
            const isBoundary = date === period.start || date === nextCycleStart;
            const moneyLabel = isAmountsHidden ? t('Số tiền đã ẩn', 'Amounts hidden') : `${t('Thu', 'Income')} ${formatVND(day?.income || 0)}, ${t('Chi', 'Expenses')} ${formatVND(day?.expense || 0)}`;
            const content = <><span className={'mb-1 block text-xs font-semibold ' + (selectable ? 'text-zinc-200' : 'text-zinc-500')}>{Number(date.slice(8))}{date === today && <span className="sr-only"> · {t('Hôm nay', 'Today')}</span>}</span>
              {day && day.count > 0 ? isAmountsHidden ? <span className="block text-[9px] text-zinc-400">••••</span> : <>
                {day.income > 0 && <span className="block truncate text-[9px] font-medium text-emerald-400 sm:text-[10px]">+{formatShortVND(day.income)}</span>}
                {day.expense > 0 && <span className="block truncate text-[9px] font-medium text-rose-400 sm:text-[10px]">−{formatShortVND(day.expense)}</span>}</>
                : selectable ? <span aria-hidden="true" className="text-[10px] text-zinc-500">—</span> : null}
              {isBoundary && inMonth && <span aria-hidden="true" className="mt-1 block text-[8px] font-semibold text-indigo-300">{t('Kỳ mới', 'New cycle')}</span>}</>;
            const className = 'min-h-16 min-w-0 border-b border-r border-zinc-800 px-1 py-2 text-left last:border-r-0 sm:px-2 ';
            return selectable ? <button key={date} type="button" data-date={date} aria-pressed={selectedDate === date}
              aria-label={`${fullDate(date)} · ${day?.count || 0} ${t('giao dịch thu chi', 'income/expense transactions')} · ${moneyLabel}${isBoundary ? ' · ' + t('Bắt đầu chu kỳ', 'Cycle starts') : ''}`}
              onClick={() => changeDate(date)} className={className + ' cursor-pointer transition-colors hover:bg-indigo-500/10 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ' + (date === selectedDate ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500' : '')}>{content}</button>
              : <div key={date} aria-label={`${fullDate(date)} · ${t('Ngoài chu kỳ đang xem', 'Outside the selected cycle')}`} className={className + ' opacity-50'}>{content}</div>;
          })}
        </div>
        <p className="px-3 py-2 text-[10px] leading-relaxed text-zinc-400">{t('Dấu —: chưa có ghi chép phù hợp bộ lọc. Chọn ngày trong chu kỳ để xem hoặc ghi bổ sung.', '— means no matching records. Select a day in this cycle to view or add transactions.')}</p>
      </section>

      <section className={card + ' p-3 sm:p-4'} aria-label={t('Giao dịch trong ngày', 'Selected day transactions')}>
        <header><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-white"><time dateTime={selectedDate}>{fullDate(selectedDate)}</time></h2><span className="rounded-lg bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">{dailyTransactions.length} {t('giao dịch', 'transactions')}</span></div>
          <p className="mt-2 text-xs"><span className="text-emerald-400">{t('Thu', 'Income')} {formatVND(selectedDay?.income || 0, isAmountsHidden)}</span><span className="text-zinc-400"> · </span><span className="text-rose-400">{t('Chi', 'Expenses')} {formatVND(selectedDay?.expense || 0, isAmountsHidden)}</span></p></header>
        <ul className="mt-3 divide-y divide-zinc-800">
          {dailyTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(tx => {
            const category = findTransactionCategory(tx.category, tx.type === 'income' ? 'income' : 'expense', undefined, customCategories, tx.categoryId);
            const name = tx.categoryId?.startsWith('custom-') || category?.isCustom ? tx.category : localizeText(tx.category || t('Chưa phân loại', 'Uncategorized'), language);
            const source = accounts.find(row => row.id === tx.bankAccountId);
            return <li key={tx.id} className="flex min-w-0 items-start gap-2 py-3">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-indigo-300"><CategoryIcon name={tx.categoryIcon || category?.icon || 'tag'} className="h-4 w-4"/></span>
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold text-zinc-200">{tx.description || name}</p><p className="mt-1 break-words text-[10px] text-zinc-400">{name} · {isDashboardJarTransaction(tx) ? t('Trong hũ', 'Inside jars') : t('Ngoài hũ', 'Outside jars')}</p>
                <p className="mt-1 text-[10px] text-zinc-400">{source?.bankName || (tx.paymentMethodCode === 'CASH' ? t('Tiền mặt', 'Cash') : t('Chưa ghi tài khoản', 'Account not recorded'))}</p></div>
              <div className="max-w-[45%] text-right"><strong className={'block break-all font-mono text-xs ' + (tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>{isAmountsHidden ? formatVND(0, true) : (tx.type === 'income' ? '+' : '−') + formatVND(tx.amount)}</strong>
                <button type="button" aria-label={`${t('Chỉnh sửa giao dịch', 'Edit transaction')} · ${tx.description || name}`} className={button + ' mt-1 min-w-11 border-0 px-2'} onClick={() => onEditTransaction(tx)}><Pencil size={13} aria-hidden="true"/><span className="sr-only">{t('Chỉnh sửa', 'Edit')}</span></button></div>
            </li>;
          })}
        </ul>
        {dailyTransactions.length === 0 && <p className="py-8 text-center text-xs leading-relaxed text-zinc-400">{t('Chưa có ghi chép thu/chi phù hợp ngày và bộ lọc này.', 'No income/expense records match this date and these filters.')}</p>}
        {pages > 1 && <nav className="mb-3 flex items-center justify-between gap-2" aria-label={t('Phân trang giao dịch ngày', 'Daily transaction pages')}>
          <button type="button" className={button} disabled={page === 0} aria-label={t('Giao dịch trước', 'Previous transactions')} onClick={() => setPageDraft({ key: pageKey, page: page - 1 })}><ChevronLeft size={16}/></button>
          <span className="text-xs text-zinc-400" aria-live="polite">{page + 1}/{pages}</span>
          <button type="button" className={button} disabled={page === pages - 1} aria-label={t('Giao dịch tiếp theo', 'Next transactions')} onClick={() => setPageDraft({ key: pageKey, page: page + 1 })}><ChevronRight size={16}/></button></nav>}
        <button type="button" disabled={selectedDate > today} className={button + ' w-full text-indigo-300'} onClick={() => onAddTransaction(selectedDate, 'expense')}><Plus size={15} aria-hidden="true"/>{t('Ghi giao dịch ngày này', 'Add transaction on this day')}</button>
        <p className="mt-2 text-[10px] text-zinc-400">{dateRange}</p>
      </section>
    </div>
    <button type="button" aria-label={t('Quản lý hũ', 'Manage jars')} onClick={() => onManageJars()}
      className={card + ' flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden'}>
      <Wallet size={18} className="shrink-0 text-indigo-300" aria-hidden="true"/>
      <span className="flex-1 text-xs font-bold text-zinc-200">{t('Hũ tài chính', 'Financial jars')} · {jars.length}</span>
      <span className="text-xs font-semibold text-indigo-300">{t('Quản lý', 'Manage')}</span><ChevronRight size={16} className="text-zinc-400" aria-hidden="true"/>
    </button>
  </div>;
}
