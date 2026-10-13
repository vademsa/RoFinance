import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Users, X } from 'lucide-react';
import { COMMUNITY_PAGE_SIZE, validateCommunityDesign, type CommunityDesign, type CommunityPlan } from '../../shared/communityPlans';
import type { Jar } from '../types';
import { communityApi } from '../lib/communityApi';

export function CommunityPlansModal({ jars, ownerId, language, onClose, onAdopt, onRefresh }: {
  jars: Jar[]; ownerId: string; language: 'en' | 'vi'; onClose: () => void;
  onAdopt: (planId: string, requestId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const [mine, setMine] = useState(false), [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [plans, setPlans] = useState<CommunityPlan[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [editing, setEditing] = useState(false), [selected, setSelected] = useState<CommunityPlan | null>(null);
  const [draft, setDraft] = useState<CommunityDesign>(() => ({ title: '', description: '', publicAlias: '', jars: jars.map(j => ({ code: j.code, name: j.name, percentage: j.percentage, color: /^#[0-9a-f]{6}$/i.test(j.color) ? j.color : '#6366f1', description: j.description || '' })) }));
  const root = useRef<HTMLDivElement>(null), closeRef = useRef(onClose), busyRef = useRef(false);
  const receipt = useRef<{ planId: string; requestId: string } | null>(null);
  closeRef.current = onClose; busyRef.current = busy;
  const input = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const button = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
  const explainError = (e: unknown) => {
    const code = e instanceof Error ? e.message : '';
    return code === 'INVALID_PERCENTAGE_TOTAL' ? t('Tổng tỷ lệ phải bằng 100%.', 'Percentages must total 100%.')
      : code === 'INVALID_DESIGN' ? t('Kiểm tra tên, bí danh, mã hũ duy nhất và tỷ lệ (tối đa 2 số thập phân).', 'Check names, public alias, unique jar codes and percentages (up to 2 decimals).')
      : code === 'STALE_FINANCE' ? t('Dữ liệu đã thay đổi. Đóng cửa sổ và tải lại trước khi áp dụng.', 'Data changed. Close this window and refresh before applying.')
      : code === 'PLAN_FINANCE_CONFLICT' ? t('Mẫu chưa tương thích với dữ liệu hiện tại. Không có thay đổi hoặc điểm nào được ghi nhận.', 'This template conflicts with your current data. No changes or rewards were saved.')
      : code === 'PLAN_LIMIT' ? t('Bạn đã đạt giới hạn 50 mẫu.', 'You have reached the limit of 50 templates.')
      : code === 'APP_UPDATE_REQUIRED' ? t('Vui lòng cập nhật ứng dụng trước khi tiếp tục.', 'Please update the app before continuing.')
      : t('Không thể hoàn tất. Kiểm tra kết nối và thử lại.', 'Could not finish. Check your connection and retry.');
  };
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    communityApi.list(page, mine, ownerId).then(result => { if (active) { setPlans(result.plans); setTotal(result.total); } })
      .catch(e => { if (active) setError(explainError(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, mine, reload, ownerId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') || []).filter(n => n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { e.preventDefault(); root.current?.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  const publish = async () => {
    if (busyRef.current) return;
    setError('');
    try { validateCommunityDesign(draft); } catch (e) { setError(explainError(e)); return; }
    busyRef.current = true; setBusy(true);
    try { await communityApi.publish(draft, ownerId); setEditing(false); setMine(true); setPage(1); setReload(x => x + 1); }
    catch (e) { setError(explainError(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const adopt = async () => {
    if (!selected || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    if (receipt.current?.planId !== selected.id) receipt.current = { planId: selected.id, requestId: crypto.randomUUID() };
    try { await onAdopt(selected.id, receipt.current.requestId); }
    catch (e) { setError(explainError(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const updateJar = (index: number, patch: Partial<CommunityDesign['jars'][number]>) => setDraft(d => ({ ...d, jars: d.jars.map((j, i) => i === index ? { ...j, ...patch } : j) }));
  return <div data-no-translate="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget && !busyRef.current) onClose(); }}>
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="community-title" className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl focus:outline-none">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 p-4 sm:p-5"><h2 id="community-title" className="flex items-center gap-2 text-lg font-bold"><Users size={20}/>{t('Mẫu hũ cộng đồng', 'Community jar templates')}</h2><button type="button" className={button} disabled={busy} onClick={onClose} aria-label={t('Đóng', 'Close')}><X size={18}/></button></header>
      <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
        <p className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm">{t('Tác giả nhận +20 điểm cho mỗi người dùng mới áp dụng từng mẫu. Tự áp dụng hoặc dùng lại không nhận thêm điểm. Chỉ chia sẻ thiết kế, không chia sẻ số tiền hay ngân hàng.', 'Creators earn +20 points for each new user adopting each template. Self-use and repeat use do not earn points. Only designs are shared, never money or banks.')}</p>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm"><p>{error}</p>{selected && <button type="button" disabled={busy} className={`${button} mt-2`} onClick={async () => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await onRefresh(); setError(''); } catch (e) { setError(explainError(e)); } finally { busyRef.current = false; setBusy(false); } }}>{t('Tải lại dữ liệu', 'Reload data')}</button>}</div>}
        {selected ? <section className="space-y-4">
          <h3 className="text-lg font-bold">{selected.title}</h3><p className="text-sm">{t('Cấu hình hiện tại sẽ được lưu để quay lại. Tiền chưa chi được giữ và chuyển sang mẫu mới; lịch sử giao dịch không bị xóa. Hũ mới cần liên kết ngân hàng của bạn nếu chưa có.', 'Your current configuration is saved for restoring later. Unspent money is preserved and moved to the new template; transactions are not deleted. New jars need your own bank links if not already configured.')}</p>
          <div className="flex flex-wrap gap-2">{selected.jars.map(j => <span key={j.code} className="rounded-xl border border-zinc-700 p-2"><span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: j.color }}/>{j.name} · {j.percentage}%</span>)}</div>
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>{t('Quay lại', 'Back')}</button><button type="button" className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`} disabled={busy} onClick={() => void adopt()}>{busy ? t('Đang áp dụng…', 'Applying…') : t('Xác nhận áp dụng', 'Confirm adoption')}</button></div>
        </section> : editing ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void publish(); }}>
          <p className="text-sm">{t('Tên, bí danh và mô tả sẽ công khai. Không nhập email, số tài khoản hoặc thông tin cá nhân.', 'Names, alias and descriptions will be public. Do not enter email addresses, account numbers or personal information.')}</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">{t('Tên mẫu', 'Template name')}<input required maxLength={80} className={input} value={draft.title} disabled={busy} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}/></label><label className="space-y-1 text-sm">{t('Bí danh công khai', 'Public alias')}<input required minLength={2} maxLength={24} className={input} value={draft.publicAlias} disabled={busy} onChange={e => setDraft(d => ({ ...d, publicAlias: e.target.value }))}/></label></div>
          <label className="block space-y-1 text-sm">{t('Mô tả mẫu', 'Template description')}<textarea maxLength={300} className={input} value={draft.description} disabled={busy} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}/></label>
          {draft.jars.map((j, i) => <fieldset key={i} className="rounded-2xl border border-zinc-700 p-3"><legend className="px-2 text-sm font-semibold">{t('Hũ', 'Jar')} {i + 1}</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-sm">{t('Mã hũ', 'Jar code')}<input className={input} maxLength={16} required disabled={busy} value={j.code} onChange={e => updateJar(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}/></label>
            <label className="text-sm">{t('Tên hũ', 'Jar name')}<input className={input} maxLength={60} required disabled={busy} value={j.name} onChange={e => updateJar(i, { name: e.target.value })}/></label>
            <label className="text-sm">{t('Tỷ lệ %', 'Percentage %')}<input type="number" inputMode="decimal" min={0} max={100} step={0.01} className={input} required disabled={busy} value={j.percentage} onChange={e => updateJar(i, { percentage: e.target.value === '' ? 0 : Number(e.target.value) })}/></label>
            <label className="text-sm">{t('Màu', 'Color')}<input type="color" className={`${input} h-11 cursor-pointer`} disabled={busy} value={j.color} onChange={e => updateJar(i, { color: e.target.value })}/></label>
          </div><div className="mt-3 flex items-end gap-2"><label className="flex-1 text-sm">{t('Mô tả hũ', 'Jar description')}<input maxLength={140} className={input} disabled={busy} value={j.description} onChange={e => updateJar(i, { description: e.target.value })}/></label><button type="button" className={button} disabled={busy || draft.jars.length === 1} aria-label={`${t('Xóa hũ', 'Remove jar')} ${i + 1}`} onClick={() => setDraft(d => ({ ...d, jars: d.jars.filter((_, n) => n !== i) }))}><Trash2 size={17}/></button></div></fieldset>)}
          <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={button} disabled={busy || draft.jars.length >= 20} onClick={() => setDraft(d => ({ ...d, jars: [...d.jars, { code: `JAR_${d.jars.length + 1}`, name: '', percentage: 0, color: '#6366f1', description: '' }] }))}><Plus size={16}/>{t('Thêm hũ', 'Add jar')}</button><span className="text-sm font-bold">{t('Tổng', 'Total')}: {draft.jars.reduce((s, j) => s + j.percentage, 0).toFixed(2)}%</span></div>
          <div className="flex gap-2"><button type="button" className={button} disabled={busy} onClick={() => setEditing(false)}>{t('Hủy', 'Cancel')}</button><button type="submit" className={`${button} bg-indigo-600 text-white hover:bg-indigo-500`} disabled={busy}>{busy ? t('Đang đăng…', 'Publishing…') : t('Đăng công khai', 'Publish publicly')}</button></div>
        </form> : <>
          <div className="mb-4 flex flex-wrap gap-2"><button type="button" className={button} aria-pressed={!mine} onClick={() => { setMine(false); setPage(1); }}>{t('Khám phá', 'Explore')}</button><button type="button" className={button} aria-pressed={mine} onClick={() => { setMine(true); setPage(1); }}>{t('Mẫu của tôi', 'My templates')}</button><button type="button" className={`${button} ml-auto bg-indigo-600 text-white hover:bg-indigo-500`} onClick={() => { setError(''); setEditing(true); }}><Plus size={16}/>{t('Thiết kế mẫu', 'Design template')}</button></div>
          {loading ? <p role="status">{t('Đang tải mẫu…', 'Loading templates…')}</p> : !plans.length ? <p className="py-8 text-center text-sm">{t('Chưa có mẫu. Hãy chia sẻ thiết kế đầu tiên!', 'No templates yet. Share the first design!')}</p> : <div className="grid gap-3 sm:grid-cols-2">{plans.map(plan => <article key={plan.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-4"><div><h3 className="break-words font-bold">{plan.title}</h3><p className="break-words text-sm">{plan.publicAlias} · {plan.adoptionCount} {t('người dùng', 'users')}{!plan.active && ` · ${t('Đã ẩn', 'Unpublished')}`}</p></div><p className="break-words text-sm">{plan.description}</p><div className="flex flex-wrap gap-2">{plan.jars.map(j => <span key={j.code} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs"><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: j.color }}/>{j.name} {j.percentage}%</span>)}</div><div className="mt-auto flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !plan.active} onClick={() => { setError(''); setSelected(plan); }}>{t('Sử dụng mẫu', 'Use template')}</button>{plan.isOwner && plan.active && <button type="button" className={button} disabled={busy} onClick={async () => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { await communityApi.unpublish(plan.id, ownerId); setReload(x => x + 1); } catch (e) { setError(explainError(e)); } finally { busyRef.current = false; setBusy(false); } }}>{t('Ẩn mẫu', 'Unpublish')}</button>}</div></article>)}</div>}
          <nav aria-label={t('Phân trang mẫu hũ', 'Template pagination')} className="mt-5 flex items-center justify-center gap-3"><button type="button" className={button} disabled={page <= 1 || loading} aria-label={t('Trang trước', 'Previous page')} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18}/></button><span className="text-sm">{page} / {Math.max(1, Math.ceil(total / COMMUNITY_PAGE_SIZE))}</span><button type="button" className={button} disabled={page * COMMUNITY_PAGE_SIZE >= total || loading} aria-label={t('Trang sau', 'Next page')} onClick={() => setPage(p => p + 1)}><ChevronRight size={18}/></button></nav>
        </>}
      </div>
    </div>
  </div>;
}
