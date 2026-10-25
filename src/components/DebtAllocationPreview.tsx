import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { apiFetch } from '@platform';
import type { Jar } from '../types';
import { formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { localizeText } from './TranslationLayer';
import { parseJarAllocationRequest, parseJarAllocationSuggestion, percentUnits } from '../../shared/jarAllocation';

const button = 'min-h-11 cursor-pointer rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';

export function DebtAllocationPreview({ currentJars, draftJars, editableCodes, income, stale, hidden, onConfirm, onClose }: {
  currentJars: Jar[]; draftJars: Jar[]; editableCodes: string[]; income: number; stale: boolean; hidden: boolean;
  onConfirm: (jars: Jar[]) => void; onClose: () => void;
}) {
  const language = getRuntimePreferences().language;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const [proposal, setProposal] = useState(draftJars);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const submitted = useRef(false);
  const outsideDown = useRef(false);
  const aiInput = parseJarAllocationRequest({ language, jars: draftJars.map(({ code, percentage }) => ({ code, percentage })), editableCodes });
  useEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal();
    return () => {
      pending.current?.abort(); pending.current = null; element.close(); document.body.style.overflow = overflow;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { if (stale) { pending.current?.abort(); pending.current = null; setLoading(false); } }, [stale]);
  const requestAI = async () => {
    if (!aiInput || stale || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setLoading(true); setError('');
    const timeout = window.setTimeout(() => {
      if (pending.current === controller) {
        controller.abort(); pending.current = null; setLoading(false);
        setError(t('AI phản hồi quá lâu. Bạn vẫn có thể dùng đề xuất hiện tại.', 'AI timed out. You can still use the current proposal.'));
      }
    }, 35000);
    try {
      const response = await apiFetch('/api/ai/jar-allocation', { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiInput) });
      if (!response.ok) throw new Error(response.status === 429 ? 'RATE_LIMIT' : 'UNAVAILABLE');
      const suggestion = parseJarAllocationSuggestion(await response.json(), aiInput);
      if (controller.signal.aborted || pending.current !== controller) return;
      if (!suggestion) throw new Error('INVALID');
      setProposal(draftJars.map(jar => !editableCodes.includes(jar.code) ? jar : ({ ...jar, percentage: suggestion.allocation[jar.code],
        cycleAllocation: Math.round(income * suggestion.allocation[jar.code] / 100),
        targetBudget: Math.round(income * suggestion.allocation[jar.code] / 100) })));
      setReason(suggestion.reason);
    } catch (caught) {
      if (!controller.signal.aborted && pending.current === controller) setError(caught instanceof Error && caught.message === 'RATE_LIMIT'
        ? t('Đã hết lượt gợi ý tạm thời. Bạn vẫn có thể dùng đề xuất hiện tại.', 'Too many AI requests. You can still use the current proposal.')
        : t('Chưa lấy được đề xuất AI hợp lệ. Tỷ lệ chưa được thay đổi.', 'A valid AI proposal is unavailable. Your allocation has not changed.'));
    } finally { window.clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setLoading(false); } }
  };
  const confirm = () => {
    if (stale || loading || pending.current || submitted.current || proposal.reduce((sum, jar) => sum + percentUnits(jar.percentage), 0) !== 10000) return;
    submitted.current = true; onConfirm(proposal);
  };
  const outside = (event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  return createPortal(<dialog ref={dialog} data-no-translate="true" aria-labelledby="debt-allocation-preview-title"
    className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-[#18181b] p-0 font-sans text-zinc-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { outsideDown.current = event.target === event.currentTarget && outside(event); }}
    onClick={event => { if (outsideDown.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
    <div className="flex max-h-[88dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 p-4 sm:p-5">
        <div><h2 id="debt-allocation-preview-title" className="text-base font-bold text-white">{t('Đề xuất phân bổ lại hũ', 'Jar reallocation proposal')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t('Chưa có tỷ lệ nào được thay đổi. Kiểm tra đề xuất rồi xác nhận để áp dụng.', 'Nothing has changed yet. Review the proposal and confirm to apply it.')}</p></div>
        <button type="button" autoFocus onClick={onClose} aria-label={t('Đóng đề xuất', 'Close proposal')} className={`${button} shrink-0 px-3`}><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {stale && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">{t('Dữ liệu đã thay đổi. Hãy đóng và mở lại đề xuất trước khi xác nhận.', 'Data has changed. Close and reopen the proposal before confirming.')}</p>}
        <div className="space-y-2" aria-label={t('So sánh tỷ lệ phân bổ', 'Allocation comparison')}>
          {proposal.map(jar => {
            const previous = currentJars.find(item => item.id === jar.id);
            const before = previous?.percentage ?? 0;
            const delta = (percentUnits(jar.percentage) - percentUnits(before)) / 100;
            const locked = jar.code !== 'DEBT' && !editableCodes.includes(jar.code);
            return <div key={jar.id} data-jar-code={jar.code} className="rounded-xl border border-zinc-800 bg-[#121214] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="break-words text-xs font-semibold text-white">{localizeText(jar.name, language)}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{jar.code}{locked ? t(' · Giữ cố định', ' · Locked') : jar.code === 'DEBT' ? t(' · Theo nợ còn lại', ' · Based on remaining debts') : ''}</p></div>
                <div className="text-right font-mono text-sm"><span className="text-zinc-400">{before}%</span><span aria-hidden="true" className="mx-2 text-zinc-500">→</span><strong className="text-white">{jar.percentage}%</strong>
                  <span className={`ml-2 text-[10px] ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>{delta > 0 ? '+' : ''}{delta}%</span></div>
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">{t('Hạn mức kỳ này (chưa gồm dư chuyển tiếp): ', 'Cycle limit (excluding carryover): ')}<span className="font-mono text-zinc-200">{formatVND(jar.cycleAllocation || 0, hidden)}</span></p>
            </div>;
          })}
        </div>
        {reason && <p role="status" className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 text-xs leading-relaxed text-zinc-300">{reason}</p>}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-bold text-emerald-400">{t('Tổng đề xuất: 100%', 'Proposed total: 100%')}</span>
          <button type="button" onClick={requestAI} disabled={!aiInput || stale || loading} className={`${button} flex items-center gap-2`}><Sparkles className={`h-4 w-4 text-purple-400 ${loading ? 'animate-pulse' : ''}`} />{loading ? t('AI đang phân tích...', 'AI is analyzing...') : t('Nhờ AI đề xuất', 'Ask AI to suggest')}</button></div>
        <p className="text-[11px] leading-relaxed text-zinc-400">{t('Chỉ cập nhật tỷ lệ và hạn mức kỳ hiện tại. Giữ nguyên dư chuyển tiếp, chi tiêu đã ghi, số dư ngân hàng và các chu kỳ cũ. AI chỉ nhận mã hũ và tỷ lệ.', 'Only rates and current-cycle limits change. Carryovers, recorded spending, bank balances and previous cycles stay intact. AI only receives jar codes and percentages.')}</p>
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-800 p-4">
        <button type="button" onClick={onClose} className={button}>{t('Hủy', 'Cancel')}</button>
        <button type="button" onClick={confirm} disabled={stale || loading} className={`${button} border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500`}>{t('Xác nhận phân bổ', 'Confirm allocation')}</button>
      </footer>
    </div>
  </dialog>, document.body);
}
