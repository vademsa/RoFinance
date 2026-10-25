import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiFetch } from '@platform';
import type { CategoryTotal } from '../utils/analytics';
import { buildCategoryChartView, defaultCategoryChartView, type CategoryChartView } from '../utils/categoryChartView';
import { parseChartGroupSuggestions, type ChartGroupSuggestion } from '../../shared/categoryChartGroups';
import { getRuntimePreferences } from '../lib/preferences';
import { localizeText } from './TranslationLayer';
import { CategoryBreakdown } from './CategoryBreakdown';

const button = 'min-h-11 cursor-pointer rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
const input = 'min-h-11 min-w-0 rounded-xl border border-zinc-700 bg-[#121214] px-3 py-2 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export function CategoryChartPanel({ categories, chartLabel, emptyLabel, isAmountsHidden, type, onViewTransactions }: {
  categories: CategoryTotal[]; chartLabel: string; emptyLabel: string; isAmountsHidden: boolean;
  type: 'income' | 'expense'; onViewTransactions: (category: CategoryTotal, sourceNames: string[]) => void;
}) {
  const [view, setView] = useState<CategoryChartView>(defaultCategoryChartView);
  const [editing, setEditing] = useState(false);
  const language = getRuntimePreferences().language;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const rows = buildCategoryChartView(categories, view);
  const selectedCount = rows.reduce((sum, row) => sum + row.sourceNames.length, 0);
  const modified = view.selectedNames !== null || view.groups.length > 0;
  useEffect(() => { if (isAmountsHidden) setEditing(false); }, [isAmountsHidden]);
  const catalogueKey = JSON.stringify(categories.map(row => row.name).sort());
  return <div data-no-translate="true">
    {!isAmountsHidden && categories.length > 0 && <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => setEditing(true)}>{t('Chọn & nhóm danh mục', 'Select & group categories')}</button>
        {modified && <button type="button" className={button} onClick={() => setView(defaultCategoryChartView())}>{t('Về biểu đồ gốc', 'Reset chart')}</button>}
      </div>
      {modified && <p role="status" className="text-[11px] leading-relaxed text-zinc-400">
        {t(`Đang vẽ ${selectedCount}/${categories.length} danh mục. Tỷ trọng chỉ tính trên phần đã chọn.`, `Showing ${selectedCount}/${categories.length} categories. Percentages use only the selection.`)}
      </p>}
    </div>}
    <CategoryBreakdown key={JSON.stringify(view)} categories={rows} chartLabel={chartLabel}
      emptyLabel={categories.length && !rows.length ? t('Chưa chọn danh mục để vẽ. Mở bộ chọn hoặc trở về biểu đồ gốc.', 'No categories selected. Open the selector or reset the chart.') : emptyLabel}
      isAmountsHidden={isAmountsHidden}
      totalLabel={modified ? t('Tổng đang hiển thị', 'Displayed total') : undefined}
      basisLabel={modified ? t('Nhóm chỉ dùng để vẽ; không thay đổi giao dịch gốc.', 'Groups are display-only; original transactions are unchanged.') : undefined}
      onViewTransactions={category => onViewTransactions(category, rows.find(row => row.name === category.name)?.sourceNames || [category.name])} />
    {!isAmountsHidden && editing && <CategoryChartEditor key={catalogueKey} categories={categories} initialView={view} type={type}
      onClose={() => setEditing(false)} onApply={next => { setView(next); setEditing(false); }} />}
  </div>;
}

function CategoryChartEditor({ categories, initialView, type, onApply, onClose }: {
  categories: CategoryTotal[]; initialView: CategoryChartView; type: 'income' | 'expense';
  onApply: (view: CategoryChartView) => void; onClose: () => void;
}) {
  const language = getRuntimePreferences().language;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const catalog = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((row, index) => ({
    id: `c${index}`, label: row.name, display: row.isCustom ? row.name : localizeText(row.name, language),
  })), [categories, language]);
  const [selected, setSelected] = useState(() => new Set(initialView.selectedNames ?? categories.map(row => row.name)));
  const [groups, setGroups] = useState(() => initialView.groups.map(group => ({ name: group.name, members: [...group.members] })));
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<ChartGroupSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const outsideDown = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal();
    return () => { pending.current?.abort(); pending.current = null; element.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus({ preventScroll: true }); };
  }, []);
  const clearAI = () => { pending.current?.abort(); pending.current = null; setLoading(false); setProposal(null); setError(''); };
  const changeSelected = (names: Set<string>) => {
    clearAI(); setSelected(names);
    setGroups(previous => previous.map(group => ({ ...group, members: group.members.filter(name => names.has(name)) })));
  };
  const selectedCatalog = catalog.filter(row => selected.has(row.label));
  const usedGroups = groups.filter(group => group.members.length > 0);
  const payload = { groups: usedGroups.map(group => ({ name: group.name,
    memberIds: catalog.filter(row => group.members.includes(row.label) && selected.has(row.label)).map(row => row.id) })) };
  const validGroups = parseChartGroupSuggestions(payload, catalog);
  const addGroup = () => {
    const name = groupName.trim();
    const key = (value: string) => value.normalize('NFC').toLocaleLowerCase();
    if (!name || name.length > 70 || /[\u0000-\u001f\u007f]/.test(name) || groups.length >= 50
      || [...catalog.map(row => row.label), ...groups.map(group => group.name)].some(label => key(label) === key(name))) {
      setError(t('Tên nhóm phải khác tên danh mục/nhóm có sẵn, tối đa 70 ký tự (tối đa 50 nhóm).', 'Use a unique group name, different from existing categories, up to 70 characters (maximum 50 groups).')); return;
    }
    clearAI(); setGroups(previous => [...previous, { name, members: [] }]); setGroupName('');
  };
  const requestAI = async () => {
    clearAI();
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    const timeout = window.setTimeout(() => {
      if (pending.current === controller) { controller.abort(); pending.current = null; setLoading(false); setError(t('AI phản hồi quá lâu. Hãy thử lại hoặc tự tạo nhóm.', 'AI timed out. Retry or create your own groups.')); }
    }, 35000);
    try {
      const response = await apiFetch('/api/ai/category-groups', { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, language, categories: selectedCatalog.map(({ id, label }) => ({ id, label })) }) });
      if (controller.signal.aborted || pending.current !== controller) return;
      if (!response.ok) {
        setError(response.status === 429 ? t('Đã hết lượt gợi ý tạm thời. Vui lòng thử lại sau.', 'Too many suggestions. Please try again later.')
          : t('Chưa thể lấy đề xuất AI. Bạn vẫn có thể tự tạo nhóm.', 'AI suggestions are unavailable. You can still create groups manually.')); return;
      }
      const parsed = parseChartGroupSuggestions(await response.json(), selectedCatalog);
      if (controller.signal.aborted || pending.current !== controller) return;
      if (!parsed) { setError(t('Đề xuất không hợp lệ. Vui lòng thử lại.', 'Invalid suggestion. Please try again.')); return; }
      setProposal(parsed);
    } catch {
      if (!controller.signal.aborted && pending.current === controller) setError(t('Không kết nối được AI. Bạn có thể tự tạo nhóm.', 'Could not connect to AI. You can create groups manually.'));
    } finally { window.clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setLoading(false); } }
  };
  const outside = (event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  const visible = catalog.filter(row => `${row.display} ${row.label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return createPortal(<dialog ref={dialog} data-no-translate="true" aria-labelledby="category-chart-editor-title"
    className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-[#18181b] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { outsideDown.current = event.target === event.currentTarget && outside(event); }}
    onClick={event => { if (outsideDown.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
    <div className="flex max-h-[88dvh] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-800 p-4 sm:p-5">
        <div className="min-w-0"><h2 id="category-chart-editor-title" className="text-base font-bold text-white">{t('Tùy chỉnh biểu đồ', 'Customize chart')} · {type === 'expense' ? t('Chi', 'Expenses') : t('Thu', 'Income')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t('Chỉ thay đổi cách vẽ trong lần xem này. Không sửa dữ liệu, tổng thu/chi hay Excel. Đổi chu kỳ hoặc rời trang sẽ trở về biểu đồ gốc.', 'Display only for this visit. Data, overall totals and Excel are unchanged. Switching cycles or leaving this page resets the chart.')}</p></div>
        <button autoFocus type="button" className={button + ' shrink-0'} aria-label={t('Đóng tùy chỉnh biểu đồ', 'Close chart settings')} onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <section className="space-y-2" aria-label={t('Nhóm lớn', 'Parent groups')}>
          <p className="text-xs font-semibold text-white">{t('Tạo nhóm lớn, rồi gán danh mục bên dưới', 'Create parent groups, then assign categories below')}</p>
          <div className="flex flex-wrap gap-2"><input aria-label={t('Tên nhóm lớn', 'Parent group name')} placeholder={t('Ví dụ: Ăn uống', 'e.g. Food & drinks')} maxLength={70}
            className={input + ' flex-1'} value={groupName} onChange={event => setGroupName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addGroup(); } }} />
            <button type="button" className={button} onClick={addGroup} disabled={!groupName.trim()}>{t('Thêm nhóm', 'Add group')}</button></div>
          {groups.map((group, index) => <div key={group.name} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-700 px-3 text-xs">
            <span className="min-w-0 break-words text-zinc-200">{group.name} · {group.members.length} {t('danh mục', 'categories')}</span>
            <button type="button" className={button + ' my-1 shrink-0 border-0'} onClick={() => { clearAI(); setGroups(previous => previous.filter((_, i) => i !== index)); }} aria-label={`${t('Bỏ nhóm', 'Remove group')} · ${group.name}`}>{t('Bỏ nhóm', 'Remove')}</button>
          </div>)}
          <p className="text-[11px] text-zinc-400">{t('Mỗi nhóm cần ít nhất 2 danh mục. Danh mục không gán nhóm vẫn được vẽ riêng.', 'Each group needs at least 2 categories. Ungrouped categories keep their own slices.')}</p>
        </section>
        <section className="space-y-2" aria-label={t('Danh mục cần vẽ', 'Chart categories')}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-white">{t('Danh mục cần vẽ', 'Chart categories')} · {selectedCatalog.length}/{catalog.length}</span>
            <div className="flex gap-2"><button type="button" className={button} onClick={() => changeSelected(new Set(catalog.map(row => row.label)))}>{t('Chọn tất cả', 'Select all')}</button>
              <button type="button" className={button} onClick={() => changeSelected(new Set())}>{t('Bỏ chọn', 'Clear selection')}</button></div></div>
          <input aria-label={t('Tìm danh mục để vẽ', 'Search chart categories')} placeholder={t('Tìm danh mục…', 'Search categories…')} className={input + ' w-full'} value={query} onChange={event => setQuery(event.target.value)} />
          <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-700 p-2">
            {visible.map(row => <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 hover:bg-zinc-800/50">
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm text-zinc-200">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-indigo-500" checked={selected.has(row.label)}
                  onChange={event => { const next = new Set(selected); if (event.target.checked) next.add(row.label); else next.delete(row.label); changeSelected(next); }} />
                <span className="break-words [overflow-wrap:anywhere]">{row.display}</span></label>
              {groups.length > 0 && selected.has(row.label) && <select className={input + ' w-full sm:w-52 sm:text-xs'} aria-label={`${t('Nhóm của', 'Group for')} · ${row.display}`}
                value={groups.findIndex(group => group.members.includes(row.label))}
                onChange={event => { clearAI(); const target = Number(event.target.value); setGroups(previous => previous.map((group, index) => ({ ...group,
                  members: [...group.members.filter(name => name !== row.label), ...(index === target ? [row.label] : [])] }))); }}>
                <option value={-1}>{t('Không nhóm', 'Ungrouped')}</option>{groups.map((group, index) => <option key={group.name} value={index}>{group.name}</option>)}
              </select>}
            </li>)}
            {!visible.length && <li className="p-3 text-xs text-zinc-400">{t('Không có danh mục phù hợp.', 'No matching categories.')}</li>}
          </ul>
        </section>
        <section className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3" aria-label={t('Đề xuất AI', 'AI suggestions')}>
          <button type="button" className={button} disabled={loading || selectedCatalog.length < 2 || selectedCatalog.length > 200} onClick={requestAI}>{loading ? t('Đang lấy đề xuất…', 'Getting suggestions…') : t('Nhờ AI đề xuất nhóm', 'Ask AI for groups')}</button>
          <p className="text-[11px] leading-relaxed text-zinc-400">{t('Chỉ gửi tên danh mục đã chọn cho AI, không gửi số tiền hay giao dịch. Đề xuất không tự áp dụng.', 'Only selected category names are sent to AI, never amounts or transactions. Suggestions are not applied automatically.')}</p>
          {proposal !== null && <div className="space-y-2" aria-live="polite">
            <p className="text-xs font-semibold text-white">{t('Xem trước đề xuất', 'Suggestion preview')}</p>
            {proposal.length === 0 ? <p className="text-xs text-zinc-400">{t('AI chưa tìm thấy nhóm phù hợp. Bạn có thể tự tạo nhóm.', 'AI found no useful groups. You can create groups manually.')}</p>
              : <><ul className="space-y-2 text-xs text-zinc-300">{proposal.map(group => <li key={group.name} className="break-words"><strong>{group.name}</strong>: {group.memberIds.map(id => catalog.find(row => row.id === id)!.display).join(' · ')}</li>)}</ul>
                <button type="button" className={button} onClick={() => { setGroups(proposal.map(group => ({ name: group.name, members: group.memberIds.map(id => catalog.find(row => row.id === id)!.label) }))); setProposal(null); setError(''); }}>{t('Dùng đề xuất này', 'Use these suggestions')}</button></>}
          </div>}
        </section>
        {error && <p role="alert" className="text-xs text-amber-400">{error}</p>}
        {!validGroups && <p role="alert" className="text-xs text-amber-400">{t('Mỗi nhóm đang dùng phải có ít nhất 2 danh mục và tên riêng. Hãy gán thêm danh mục hoặc bỏ nhóm.', 'Each active group needs at least 2 categories and a unique name. Assign more categories or remove the group.')}</p>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 p-4">
        <button type="button" className={button} onClick={onClose}>{t('Hủy', 'Cancel')}</button>
        <button type="button" disabled={!validGroups || loading} className={button + ' border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'}
          onClick={() => { if (validGroups) onApply({ selectedNames: selected.size === catalog.length ? null : [...selected], groups: usedGroups }); }}>{t('Vẽ biểu đồ', 'Apply to chart')}</button>
      </footer>
    </div>
  </dialog>, document.body);
}
