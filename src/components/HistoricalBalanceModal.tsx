import React, { useEffect, useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import type { Jar, MonthlyCycleSummary } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { formatVND } from '../utils/formatters';
import { getFinancialCycleStart, getNextFinancialCycleStart, parseLocalDate, toLocalDateKey } from '../utils/monthlyCycle';
import { getRuntimePreferences } from '../lib/preferences';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (date: string, jarId: string, amount: number) => string | null;
  jars: Jar[];
  summaries: MonthlyCycleSummary[];
  resetDay: number;
  initialDate?: string;
  isAmountsHidden: boolean;
};

export const HistoricalBalanceModal: React.FC<Props> = ({ isOpen, onClose, onSave, jars, summaries,
  resetDay, initialDate, isAmountsHidden }) => {
  const [date, setDate] = useState('');
  const [jarId, setJarId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState('');
  const isEnglish = getRuntimePreferences().language === 'en';
  const t = (vi: string, en: string) => isEnglish ? en : vi;

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    const previousDay = getFinancialCycleStart(now, resetDay);
    previousDay.setDate(previousDay.getDate() - 1);
    setDate(initialDate && initialDate < toLocalDateKey(now) ? initialDate : toLocalDateKey(previousDay));
    setJarId(jars[0]?.id || '');
    setAmount('');
    setError('');
  }, [isOpen, initialDate, resetDay]);

  if (!isOpen) return null;
  const parsed = parseLocalDate(date);
  const start = parsed ? getFinancialCycleStart(parsed, resetDay) : null;
  const currentStart = getFinancialCycleStart(new Date(), resetDay);
  const isHistorical = Boolean(start && start < currentStart);
  const startKey = start ? toLocalDateKey(start) : '';
  const next = start ? getNextFinancialCycleStart(start, resetDay) : null;
  if (next) next.setDate(next.getDate() - 1);
  const summary = summaries.find((item) => item.cycleStart === startKey);
  const snapshot = summary?.jarBreakdown?.find((item) => item.jarId === jarId);
  const maxDate = new Date(currentStart);
  maxDate.setDate(maxDate.getDate() - 1);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!isHistorical || amount === '' || !Number.isSafeInteger(amount) || amount < 0 || !jarId) {
      setError(t('Chọn ngày thuộc chu kỳ cũ, hũ và số dư hợp lệ.', 'Choose a past-cycle date, jar and valid balance.'));
      return;
    }
    const failure = onSave(date, jarId, amount);
    if (failure) setError(failure);
    else onClose();
  };

  return <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="historical-balance-title"
      className="my-auto w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#18181b] p-5 text-zinc-100 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 id="historical-balance-title" className="flex items-center gap-2 text-base font-black text-white">
          <CalendarRange size={18} className="text-indigo-400" />{t('Đối soát số dư hũ cũ', 'Reconcile a past jar balance')}</h2>
          <p className="mt-1 text-xs text-zinc-400">{t('Nhập số dư đầu chu kỳ lương chứa ngày đã chọn.',
            'Enter the opening balance of the salary cycle containing the selected date.')}</p></div>
        <button type="button" onClick={onClose} aria-label={t('Đóng', 'Close')}
          className="cursor-pointer rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X size={18} /></button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs font-bold text-zinc-300">{t('Ngày thuộc chu kỳ cần đối soát', 'Date in the cycle to reconcile')}
          <input type="date" className="form-input mt-1" value={date} max={toLocalDateKey(maxDate)}
            onChange={(event) => { setDate(event.target.value); setError(''); }}/></label>
        {isHistorical && <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
          {t('Chu kỳ lương:', 'Salary cycle:')} {startKey} – {next && toLocalDateKey(next)}
        </div>}
        <label className="block text-xs font-bold text-zinc-300">{t('Hũ tài chính', 'Financial jar')}
          <select className="form-input mt-1" value={jarId} onChange={(event) => { setJarId(event.target.value); setAmount(''); }}>
            {jars.map((jar) => <option value={jar.id} key={jar.id}>{jar.name} ({jar.code})</option>)}
          </select></label>
        <label className="block text-xs font-bold text-zinc-300">{t('Số dư đầu chu kỳ', 'Opening balance')}
          <CurrencyInput value={amount} onValueChange={setAmount} min={0} hideAmount={isAmountsHidden}
            className="form-input mt-1 w-full" /></label>
        {snapshot && <p className="text-xs text-zinc-400">{t('Số dư đầu kỳ đã lưu:', 'Saved opening balance:')} {formatVND(snapshot.manualOpeningBalance ?? snapshot.openingCarryover, isAmountsHidden)}</p>}
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {t('Số dư này là mốc do bạn xác nhận. Thu/chi từ ngày chọn đến ngày kết thúc chu kỳ vẫn tính theo ngày giao dịch; phân bổ lương của chu kỳ khác không bị thay đổi.',
            'This is your confirmed opening balance. Transactions remain dated as recorded and are calculated within their salary cycles; other cycles’ allocations are unchanged.')}
          <span className="mt-1 block">{t('Nếu thiếu dữ liệu nhiều chu kỳ, hãy đối soát từ chu kỳ gần hiện tại về trước. Hũ đã lưu trữ sau khi đổi kiểu phân bổ chưa thể chỉnh trong luồng này.',
            'If several cycles are missing, reconcile from the most recent backwards. Jars archived by a plan change cannot yet be edited here.')}</span>
        </p>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-zinc-600 px-4 py-2 text-xs font-bold hover:bg-zinc-800">{t('Hủy', 'Cancel')}</button>
          <button type="submit" className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">{t('Lưu số dư đầu kỳ', 'Save opening balance')}</button></div>
      </form>
    </div>
  </div>;
};
