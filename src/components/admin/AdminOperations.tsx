import React, { useEffect, useRef, useState } from 'react';
import { Toast } from '../Toast';
import { ChevronLeft, ChevronRight, Coins, Search, Users } from 'lucide-react';
import { apiFetch } from '@platform';
import type { AdminAccount, AdminAccountPage, AdminAuditPage, AdminOperationKind, AdminInventory } from '../../../shared/admin';
import { COSMETICS, ITEM_SLOTS, type ItemSlot } from '../../../shared/character';
import { CosmeticArtwork } from '../character/CosmeticArtwork';
import { AdminItemGrid } from './AdminItemGrid';
import { AdminPointsInput } from './AdminPointsInput';
import { formatAdminPoints } from '../../utils/adminPointsInput';

type Pending = { kind: AdminOperationKind; account: AdminAccount; body: Record<string, unknown>; uncertain: boolean; running: boolean; done?: boolean; error?: string };
export type AdminPendingRef = React.RefObject<Pending | null>;
type Props = { view: 'accounts' | 'audit'; language: 'vi' | 'en'; pending: AdminPendingRef; onDenied: (status: number) => void; onPendingChange: () => void };
const uuid = /^[a-f0-9-]{36}$/i;
function accountPage(value: unknown): value is AdminAccountPage {
  const row = value as AdminAccountPage;
  return Boolean(row && Number.isSafeInteger(row.total) && row.total >= 0 && row.pageSize === 12 && Number.isSafeInteger(row.page) && row.page > 0 && Array.isArray(row.accounts) && row.accounts.length <= 12 && row.accounts.every(a =>
    typeof a.id === 'string' && uuid.test(a.id) && typeof a.email === 'string' && typeof a.displayName === 'string' && Number.isFinite(Date.parse(a.createdAt)) && typeof a.isOwner === 'boolean' && typeof a.hasCharacter === 'boolean'));
}
function auditPage(value: unknown): value is AdminAuditPage {
  const row = value as AdminAuditPage;
  return Boolean(row && Number.isSafeInteger(row.total) && row.total >= 0 && row.pageSize === 12 && Number.isSafeInteger(row.page) && row.page > 0 && Array.isArray(row.entries) && row.entries.length <= 12 && row.entries.every(a =>
    typeof a.requestId === 'string' && uuid.test(a.requestId) && typeof a.targetId === 'string' && uuid.test(a.targetId) && ['grant-points', 'revoke-points', 'grant-item', 'revoke-item', 'revoke-sessions'].includes(a.kind) && typeof a.reason === 'string' && Number.isFinite(Date.parse(a.createdAt)) && a.result && typeof a.result === 'object'));
}
export default function AdminOperations({ view, language, pending, onDenied, onPendingChange }: Props) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const [accounts, setAccounts] = useState<AdminAccountPage | null>(null);
  const [audit, setAudit] = useState<AdminAuditPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminAccount | null>(null);
  const [inventory, setInventory] = useState<AdminInventory | null>(null);
  const [inventoryError, setInventoryError] = useState(false);
  const [kind, setKind] = useState<AdminOperationKind>('grant-points');
  const [points, setPoints] = useState('20');
  const [copies, setCopies] = useState('1');
  const [itemId, setItemId] = useState('');
  const [giftSlot, setGiftSlot] = useState<'all' | ItemSlot>('all');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<Pending | null>(pending.current);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const onDeniedRef = useRef(onDenied); onDeniedRef.current = onDenied;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setInventory(null); setInventoryError(false);
    if (!selected) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(`/api/admin/accounts/${selected.id}/inventory`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal });
        if (abort.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { onDeniedRef.current(response.status); return; }
        if (!response.ok) throw new Error();
        const data: AdminInventory = await response.json();
        if (abort.signal.aborted) return;
        if (!data || data.targetId !== selected.id || !data.points || !['available', 'spent', 'revoked'].every(key => Number.isSafeInteger(data.points[key as keyof typeof data.points]) && data.points[key as keyof typeof data.points] >= 0) || !Array.isArray(data.items) || data.items.length > COSMETICS.length || new Set(data.items.map(item => item.itemId)).size !== data.items.length || data.items.some(item => !COSMETICS.some(c => c.id === item.itemId) || !Number.isSafeInteger(item.copies) || item.copies < 1 || typeof item.equipped !== 'boolean')) throw new Error();
        setInventory(data);
      } catch { if (!abort.signal.aborted) setInventoryError(true); }
    })();
    return () => abort.abort();
  }, [selected, reload]);
  // A mutation can finish while this panel is unmounted during reauthorization.
  // Its parent-owned receipt survives; synchronize without issuing another write.
  useEffect(() => {
    if (!confirmation) return;
    const sync = () => {
      setTick(n => n + 1);
      if (confirmation.done) { pending.current = null; onPendingChange(); setConfirmation(null); setSelected(null); setReason(''); setMessage(language === 'vi' ? 'Đã hoàn tất và lưu lịch sử thao tác.' : 'Completed and recorded in the audit trail.'); setReload(n => n + 1); }
    };
    sync(); const interval = window.setInterval(sync, 500);
    return () => clearInterval(interval);
  }, [confirmation, language, pending]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setAccounts(null); setAudit(null); setError('');
    void (async () => {
      try {
        const response = await apiFetch(`/api/admin/${view}?page=${page}${view === 'accounts' ? `&search=${encodeURIComponent(query)}` : ''}`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal });
        if (abort.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { onDeniedRef.current(response.status); return; }
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (abort.signal.aborted) return;
        if (view === 'accounts' && accountPage(data)) setAccounts(data);
        else if (view === 'audit' && auditPage(data)) setAudit(data);
        else throw new Error();
      } catch { if (!abort.signal.aborted) setError(language === 'vi' ? 'Không thể tải dữ liệu quản trị.' : 'Unable to load administration data.'); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [view, page, query, reload, language]);
  const send = async () => {
    const operation = confirmation;
    if (!operation || operation.running || operation.done) return;
    operation.running = true; operation.uncertain = true; operation.error = ''; pending.current = operation; onPendingChange(); setTick(n => n + 1);
    try {
      // Aborting cannot undo a committed write. Preserve the exact request ID
      // and input in parent memory, even when hidden or on a different tab.
      const response = await apiFetch(`/api/admin/operations/${operation.kind}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation.body) });
      if (response.status === 401) { pending.current = null; onPendingChange(); onDeniedRef.current(response.status); return; }
      let data;
      try { data = await response.json(); } catch (error) {
        if (response.status === 403) { pending.current = null; onPendingChange(); onDeniedRef.current(response.status); return; }
        throw error;
      }
      if (response.status === 403 && data?.error !== 'ADMIN_ORIGIN_REQUIRED') { pending.current = null; onPendingChange(); onDeniedRef.current(response.status); return; }
      if (!response.ok) {
        if (response.status >= 500) throw new Error();
        operation.uncertain = response.status === 429;
        operation.error = data?.error === 'NOT_ENOUGH_POINTS' ? t('Điểm khả dụng không còn đủ. Hãy tải lại kho để xem số dư mới nhất.', 'Not enough available points. Refresh the inventory to see the latest balance.') : data?.error === 'ADMIN_ORIGIN_REQUIRED' ? t('Nguồn yêu cầu không hợp lệ. Kiểm tra cấu hình reverse proxy của máy chủ.', 'Request origin rejected. Check the server reverse-proxy configuration.') : response.status === 429 ? t('Đợi một phút rồi thử lại cùng yêu cầu.', 'Wait a minute, then retry the same request.') : ['NOT_ENOUGH_ITEMS', 'ITEM_NOT_OWNED'].includes(data.error) ? t('Tài khoản không còn đủ vật phẩm để thu hồi. Hãy tải lại kho.', 'The account no longer has enough copies. Refresh its inventory.') : t('Thao tác bị từ chối. Kiểm tra lại dữ liệu.', 'Operation rejected. Check your inputs.');
        if (!operation.uncertain) pending.current = null;
        return;
      }
      if (data.requestId !== operation.body.requestId || typeof data.replayed !== 'boolean' || !data.result || typeof data.result !== 'object') throw new Error();
      operation.done = true;
    } catch {
      operation.uncertain = true;
      operation.error = t('Chưa xác định kết quả. Thử lại dùng đúng ID cũ, không cấp hai lần.', 'Outcome uncertain. Retry uses the same request ID, never grants twice.');
    } finally { operation.running = false; onPendingChange(); if (alive.current) setTick(n => n + 1); }
  };
  const label = (value: AdminOperationKind) => value === 'grant-points' ? t('Cấp điểm thưởng', 'Grant reward points') : value === 'revoke-points' ? t('Thu hồi điểm thưởng', 'Revoke reward points') : value === 'grant-item' ? t('Tặng vật phẩm', 'Gift an item') : value === 'revoke-item' ? t('Thu hồi vật phẩm', 'Revoke an item') : t('Thu hồi phiên đăng nhập', 'Revoke sign-in sessions');
  const giftItems = COSMETICS.filter(item => !item.starter && (giftSlot === 'all' || item.slot === giftSlot));
  const slotLabel = (slot: ItemSlot) => ({ shirt: t('Áo', 'Shirts'), hat: t('Mũ', 'Hats'), shoes: t('Giày', 'Shoes'), hair: t('Tóc', 'Hair'), face: t('Gương mặt', 'Faces'), expression: t('Biểu cảm', 'Expressions'), backpack: t('Balo', 'Backpacks') })[slot];
  const prize = COSMETICS.find(item => item.id === confirmation?.body.itemId);
  const dataPage = view === 'accounts' ? accounts : audit;
  const pages = Math.max(1, Math.ceil((dataPage?.total ?? 0) / 12));
  const format = (date: string) => new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(date));
  return <section className="admin-panel admin-operations" data-sync={tick}>
    <p className="admin-notice">{t('Chỉ thông tin tài khoản và trò chơi. Không truy cập dữ liệu tài chính.', 'Account and game information only. No access to financial data.')}</p>
    {view === 'accounts' && <form className="admin-operation-search" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); setReload(n => n + 1); }}><label>{t('Tìm tài khoản', 'Find an account')}<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Email hoặc tên hiển thị', 'Email or display name')}/></label><button className="admin-button"><Search size={16}/>{t('Tìm', 'Search')}</button></form>}
    <div role="status" aria-live="polite">{loading && <p className="admin-notice">{t('Đang tải…', 'Loading…')}</p>}</div>
    {message && <Toast noTranslate eventKey={message} onDismiss={() => setMessage('')} closeLabel={t('Đóng thông báo', 'Dismiss notification')}>{message}</Toast>}
    {error && <p role="alert" className="admin-error">{error}<button className="admin-button" onClick={() => setReload(n => n + 1)}>{t('Tải lại', 'Reload')}</button></p>}
    {accounts && <div className="admin-account-list">{accounts.accounts.map(account => <article className="admin-account" key={account.id}><div><strong>{account.displayName}</strong><span>{account.email}</span><code>{account.id}</code><small>{t('Tham gia', 'Joined')} {format(account.createdAt)} · {account.hasCharacter ? t('Có nhân vật', 'Character created') : t('Chưa có nhân vật', 'No character')}{account.isOwner ? ' · Admin' : ''}</small></div><button className="admin-button" disabled={Boolean(pending.current)} onClick={() => { setSelected(account); setKind('grant-points'); setPoints('20'); setCopies('1'); setItemId(''); setReason(''); setError(''); setMessage(''); }}><Users size={16}/>{t('Quản lý', 'Manage')}</button></article>)}{!accounts.accounts.length && <p className="admin-empty">{t('Không tìm thấy tài khoản.', 'No accounts found.')}</p>}</div>}
    {audit && <div className="admin-audit-list">{audit.entries.map(entry => <article className="admin-audit" key={entry.requestId}><div><strong>{label(entry.kind)}</strong><time>{format(entry.createdAt)}</time></div><p>{entry.reason}</p><code>{entry.targetId}</code><small>{t('ID yêu cầu', 'Request ID')}: {entry.requestId}</small><span>{entry.result.points !== undefined ? `${formatAdminPoints(String(entry.result.points))} ${t('điểm', 'points')}` : entry.result.itemId ? `${entry.result.copies} × ${COSMETICS.find(item => item.id === entry.result.itemId)?.[language === 'vi' ? 'vi' : 'en'] ?? entry.result.itemId}` : `${entry.result.webSessions ?? 0} web · ${entry.result.mobileSessions ?? 0} mobile`}</span></article>)}{!audit.entries.length && <p className="admin-empty">{t('Chưa có thao tác quản trị.', 'No administration operations yet.')}</p>}</div>}
    {dataPage && <nav className="admin-pagination" aria-label={t('Phân trang quản trị', 'Administration pagination')}><button className="admin-control" disabled={page <= 1} aria-label={t('Trang trước', 'Previous page')} onClick={() => setPage(page - 1)}><ChevronLeft size={18}/></button><span>{t('Trang', 'Page')} {page} / {pages} · {dataPage.total}</span><button className="admin-control" disabled={page >= pages} aria-label={t('Trang tiếp', 'Next page')} onClick={() => setPage(page + 1)}><ChevronRight size={18}/></button></nav>}
    {selected && !confirmation && <Confirmation t={t} wide label={t('Quản lý tài khoản', 'Manage account')} dismissible onClose={() => setSelected(null)}><form className="admin-operation-form" onSubmit={event => {
      event.preventDefault(); if (pending.current || (kind === 'grant-points' || kind === 'revoke-points') && (!Number.isSafeInteger(Number(points)) || Number(points) < 1 || Number(points) > 100000) || kind === 'grant-item' && !giftItems.some(item => item.id === itemId) || kind === 'revoke-item' && !inventory?.items.some(item => item.itemId === itemId && !COSMETICS.find(c => c.id === item.itemId)?.starter) || kind === 'revoke-points' && (!inventory || Number(points) > inventory.points.available)) return;
      setConfirmation({ kind, account: selected, running: false, uncertain: false, body: { requestId: crypto.randomUUID(), targetId: selected.id, reason: reason.trim(), ...(kind === 'grant-points' || kind === 'revoke-points' ? { points: Number(points) } : kind === 'grant-item' || kind === 'revoke-item' ? { itemId, copies: Number(copies) } : {}) } });
    }}><h2>{t('Thao tác với', 'Operation for')} {selected.email}</h2><p className="admin-notice">{t('Điểm cấp không tăng xếp hạng. Đồ cấp không thay đổi trang bị đang mặc.', 'Granted points do not raise rankings. Grants do not change equipped items.')}</p>
      {!selected.hasCharacter && <p className="admin-notice">{t('Có thể tặng đồ/cấp điểm ngay. Chu kỳ nhân vật bắt đầu khi người dùng mở hồ sơ nhân vật lần đầu.', 'Gifts and points can be granted now. Enrollment starts on the first character visit.')}</p>}
      {inventory && <dl className="admin-points-summary"><div><dt><Coins size={16}/>{t('Điểm khả dụng', 'Available reward points')}</dt><dd>{inventory.points.available.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</dd></div><div><dt>{t('Đã dùng', 'Spent points')}</dt><dd>{formatAdminPoints(String(inventory.points.spent))}</dd></div><div><dt>{t('Đã thu hồi', 'Revoked points')}</dt><dd>{formatAdminPoints(String(inventory.points.revoked))}</dd></div></dl>}
      <div className="admin-manage-grid"><div className="admin-manage-controls">
      <label>{t('Thao tác', 'Action')}<select value={kind} onChange={event => { setKind(event.target.value as AdminOperationKind); setItemId(''); setCopies('1'); if (event.target.value === 'revoke-points') setPoints(String(Math.min(20, inventory?.points.available ?? 0))); }}><option value="grant-points">{label('grant-points')}</option><option value="revoke-points">{label('revoke-points')}</option><option value="grant-item">{label('grant-item')}</option><option value="revoke-item">{label('revoke-item')}</option>{!selected.isOwner && <option value="revoke-sessions">{label('revoke-sessions')}</option>}</select></label>
      {(kind === 'grant-points' || kind === 'revoke-points') && <label>{t('Điểm · 1–100.000', 'Points · 1–100,000')}<AdminPointsInput value={points} onChange={setPoints} max={kind === 'revoke-points' ? Math.min(100000, inventory?.points.available ?? 0) : 100000} language={language}/></label>}
      {kind === 'revoke-points' && <p className="admin-notice">{t('Chỉ thu hồi điểm còn khả dụng. Không thay đổi điểm xếp hạng hoặc lịch sử đã dùng.', 'Only available points can be revoked. Ranking scores and spending history stay unchanged.')}</p>}
      {kind === 'grant-item' && <><label>{t('Loại vật phẩm', 'Item type')}<select value={giftSlot} onChange={event => { setGiftSlot(event.target.value as 'all' | ItemSlot); setItemId(''); }}><option value="all">{t('Tất cả loại', 'All types')}</option>{ITEM_SLOTS.map(slot => <option value={slot} key={slot}>{slotLabel(slot)}</option>)}</select></label><label>{t('Vật phẩm', 'Item')}<select required value={itemId} onChange={event => setItemId(event.target.value)}><option value="">{t('Chọn vật phẩm', 'Choose an item')}</option>{giftItems.map(item => <option value={item.id} key={item.id}>{language === 'vi' ? item.vi : item.en} · {item.id}</option>)}</select></label><AdminItemGrid key={giftSlot} items={giftItems.map(item => ({ itemId: item.id }))} language={language} selected={itemId} onSelect={setItemId}/><label>{t('Số bản · 1–100', 'Copies · 1–100')}<input type="number" required min={1} max={100} step={1} value={copies} onChange={event => setCopies(event.target.value)}/></label><p className="admin-notice">{t('Bản đầu được sở hữu; các bản tiếp theo là đồ trùng. Có thể cấp Signature.', 'The first copy is owned; additional copies are duplicates. Signature grants are allowed.')}</p></>}
      {kind === 'revoke-sessions' && <p className="admin-notice">{t('Thu hồi phiên web/mobile hiện có. Người dùng vẫn có thể đăng nhập lại.', 'Revokes existing web/mobile sessions. The user can still sign in again.')}</p>}
      {kind === 'revoke-item' && <><label>{t('Vật phẩm đang sở hữu', 'Owned item')}<select required value={itemId} disabled={!inventory} onChange={event => { setItemId(event.target.value); setCopies('1'); }}><option value="">{t('Chọn vật phẩm để thu hồi', 'Choose an item to revoke')}</option>{inventory?.items.filter(entry => !COSMETICS.find(item => item.id === entry.itemId)?.starter).map(entry => { const item = COSMETICS.find(c => c.id === entry.itemId)!; return <option value={item.id} key={item.id}>{language === 'vi' ? item.vi : item.en} · ×{entry.copies}{entry.equipped ? t(' · đang mặc', ' · equipped') : ''}</option>; })}</select></label><label>{t('Số bản thu hồi', 'Copies to revoke')}<input type="number" required min={1} max={Math.min(100, inventory?.items.find(i => i.itemId === itemId)?.copies ?? 1)} step={1} value={copies} onChange={event => setCopies(event.target.value)}/></label><p className="admin-notice">{t('Ưu tiên thu hồi đồ trùng. Thu hồi bản cuối sẽ tháo món đang mặc và dùng đồ cơ bản thay thế. Không hoàn điểm.', 'Spare copies are removed first. Removing the last copy unequips it and restores a basic item. No points are refunded.')}</p>{!inventory ? <p className="admin-notice">{inventoryError ? t('Không tải được kho. Hãy đóng và mở lại.', 'Inventory unavailable. Close and reopen.') : t('Đang tải kho…', 'Loading inventory…')}</p> : !inventory.items.some(entry => !COSMETICS.find(item => item.id === entry.itemId)?.starter) && <p className="admin-notice">{t('Chưa có vật phẩm có thể thu hồi.', 'No revocable items.')}</p>}</>}
      <label>{t('Lý do · 5–300 ký tự', 'Reason · 5–300 characters')}<input required minLength={5} maxLength={300} value={reason} onChange={event => setReason(event.target.value)}/></label>
      <div className="admin-access-actions"><button type="button" className="admin-button" onClick={() => setSelected(null)}>{t('Hủy', 'Cancel')}</button><button className="admin-button admin-primary" disabled={kind === 'revoke-item' && (!inventory || inventoryError || !inventory.items.some(item => item.itemId === itemId && !COSMETICS.find(c => c.id === item.itemId)?.starter)) || kind === 'revoke-points' && (!inventory || inventoryError || inventory.points.available < 1)}>{t('Xem và xác nhận', 'Review and confirm')}</button></div>
      </div><aside className="admin-owned-panel"><h3>{t('Kho đồ của tài khoản', 'Account wardrobe')}</h3><p className="admin-notice">{t('Chọn một món đang sở hữu để thu hồi. Đồ cơ bản được giữ lại.', 'Choose an owned item to revoke it. Basic items are kept.')}</p>{inventory ? <AdminItemGrid inventory items={inventory.items} language={language} selected={kind === 'revoke-item' ? itemId : ''} onSelect={id => { setKind('revoke-item'); setItemId(id); setCopies('1'); }}/>: <p role="status" className="admin-notice">{inventoryError ? t('Không tải được kho đồ.', 'Inventory unavailable.') : t('Đang tải kho…', 'Loading inventory…')}</p>}<button type="button" className="admin-button" onClick={() => setReload(n => n + 1)}>{t('Tải lại kho', 'Refresh inventory')}</button></aside></div>
    </form></Confirmation>}
    {confirmation && <Confirmation t={t} dismissible={!confirmation.running && !confirmation.uncertain} onClose={() => { setConfirmation(null); setError(''); }}><h2>{label(confirmation.kind)}</h2><strong>{confirmation.account.email}</strong><code>{confirmation.account.id}</code>{prize && <div className="admin-selected-art"><CosmeticArtwork item={prize} title={language === 'vi' ? prize.vi : prize.en} size={96} effects={false}/></div>}<p>{confirmation.kind === 'grant-points' || confirmation.kind === 'revoke-points' ? `${formatAdminPoints(String(confirmation.body.points))} ${t('điểm', 'points')}` : confirmation.kind === 'grant-item' || confirmation.kind === 'revoke-item' ? `${confirmation.body.copies} × ${prize?.[language === 'vi' ? 'vi' : 'en'] ?? confirmation.body.itemId}` : t('Thu hồi phiên web và mobile', 'Revoke web and mobile sessions')}</p><p>{String(confirmation.body.reason)}</p><small>{t('ID yêu cầu', 'Request ID')}: {String(confirmation.body.requestId)}</small>{confirmation.error && <p role="alert" className="admin-error">{confirmation.error}</p>}<div className="admin-access-actions"><button className="admin-button" disabled={confirmation.running || confirmation.uncertain} onClick={() => { setConfirmation(null); setError(''); }}>{t('Hủy', 'Cancel')}</button><button className="admin-button admin-primary" disabled={confirmation.running} onClick={() => void send()}>{confirmation.running ? t('Đang thực hiện…', 'Processing…') : confirmation.uncertain ? t('Kiểm tra lại cùng yêu cầu', 'Retry the same request') : t('Xác nhận thực hiện', 'Confirm operation')}</button></div></Confirmation>}
  </section>;
}
function Confirmation({ children, dismissible, onClose, t, label, wide = false }: { children: React.ReactNode; label?: string; wide?: boolean; dismissible: boolean; onClose: () => void; t: (vi: string, en: string) => string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className={`admin-confirm${wide ? ' admin-manage-dialog' : ''}`} aria-label={label ?? t('Xác nhận thao tác quản trị', 'Confirm administration operation')} onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }} onClick={event => { if (event.target === event.currentTarget && dismissible) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>{children}</dialog>;
}
