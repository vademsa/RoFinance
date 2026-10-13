import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Database, Gift, LayoutDashboard, LockKeyhole, LogOut, Moon, RefreshCw, Search, ShieldCheck, Sun, Users } from 'lucide-react';
import { apiFetch, authApi } from '@platform';
import { isAdminOverview, type AdminOverview } from '../../../shared/admin';
import { COSMETICS, ITEM_SLOTS, RARITIES, type ItemSlot, type Rarity } from '../../../shared/character';
import { CosmeticArtwork } from '../character/CosmeticArtwork';
import '../character/character.css';
import './admin.css';
import AdminOperations, { type AdminPendingRef } from './AdminOperations';
import { BrandLogo } from '../BrandLogo';

type Status = 'loading' | 'ready' | 'login' | 'forbidden' | 'error' | 'signing-out';
const PAGE_SIZE = 12;

export default function AdminPage() {
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const [tab, setTab] = useState<'overview' | 'catalogue' | 'accounts' | 'audit'>('overview');
  const pending: AdminPendingRef = useRef(null);
  const [hasPending, setHasPending] = useState(false);
  const pendingChanged = useCallback(() => setHasPending(Boolean(pending.current && !pending.current.done)), []);
  const guardNavigation = (event: React.MouseEvent<HTMLAnchorElement>) => { if (pending.current && !pending.current.done) event.preventDefault(); };
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState<Rarity | ''>('');
  const [slot, setSlot] = useState<ItemSlot | ''>('');
  const [page, setPage] = useState(1);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const signingOut = useRef(false);
  const apiRevision = useRef<string | null>(null);
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const refresh = useCallback(async (quiet = false) => {
    if (signingOut.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++generation.current;
    if (!quiet) { setOverview(null); setStatus('loading'); }
    try {
      const response = await apiFetch('/api/admin/overview', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted || current !== generation.current) return;
      if (!response.ok) { setOverview(null); setStatus(response.status === 401 ? 'login' : response.status === 403 ? 'forbidden' : 'error'); return; }
      const data: unknown = await response.json();
      if (controller.signal.aborted || current !== generation.current) return;
      if (!isAdminOverview(data)) throw new Error('INVALID_ADMIN_RESPONSE');
      const webRevision = document.querySelector<HTMLMetaElement>('meta[name="rofinance-release"]')?.content;
      // Reconcile releases, but never discard a pending mutation receipt.
      if (!pending.current && (webRevision && data.release.webRevision && webRevision !== data.release.webRevision || apiRevision.current && apiRevision.current !== data.release.apiRevision)) {
        window.location.reload(); return;
      }
      if (!pending.current) apiRevision.current = data.release.apiRevision;
      if (data.catalogue.total !== COSMETICS.length) throw new Error('INVALID_ADMIN_RESPONSE');
      setOverview(data); setStatus('ready');
    } catch { if (!controller.signal.aborted && current === generation.current) { setOverview(null); setStatus('error'); } }
  }, []);
  useEffect(() => {
    void refresh();
    const onResume = () => { if (!document.hidden) void refresh(true); };
    const onVisibility = () => {
      if (document.hidden && !signingOut.current) {
        ++generation.current; request.current?.abort(); setOverview(null); setStatus('loading');
      } else onResume();
    };
    const interval = window.setInterval(onResume, 30000);
    window.addEventListener('focus', onResume); window.addEventListener('pageshow', onResume); document.addEventListener('visibilitychange', onVisibility);
    return () => { ++generation.current; request.current?.abort(); clearInterval(interval); window.removeEventListener('focus', onResume); window.removeEventListener('pageshow', onResume); document.removeEventListener('visibilitychange', onVisibility); };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    document.title = 'RoFinance Admin';
  }, [theme, language]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.current && !pending.current.done) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const logout = async () => {
    if (signingOut.current || pending.current && !pending.current.done) return;
    signingOut.current = true; ++generation.current; request.current?.abort();
    setOverview(null); setStatus('signing-out');
    try { await authApi.logout(); window.location.assign('/'); }
    catch { signingOut.current = false; setStatus('error'); }
  };
  const rarityName = (value: Rarity) => ({ common: t('Thường', 'Common'), rare: t('Hiếm', 'Rare'), special: t('Đặc biệt', 'Special'), legendary: t('Huyền thoại', 'Legendary') })[value];
  const slotName = (value: ItemSlot) => ({ shirt: t('Áo', 'Shirt'), hat: t('Mũ', 'Hat'), shoes: t('Giày', 'Shoes'), hair: t('Tóc', 'Hair'), face: t('Gương mặt', 'Face'), expression: t('Biểu cảm', 'Expression'), backpack: t('Balo', 'Backpack') })[value];
  const filtered = COSMETICS.filter(item => (!rarity || item.rarity === rarity) && (!slot || item.slot === slot) && `${item.vi} ${item.en} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const count = (value: number) => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'vi-VN').format(value);
  const date = (value: string) => new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));

  return <div className="admin-app" data-admin-status={status}>
    <a className="admin-skip" href="#admin-content">{t('Đến nội dung', 'Skip to content')}</a>
    <header className="admin-header">
      <a href="/" onClick={guardNavigation} aria-disabled={hasPending} className="admin-brand" aria-label={t('Trở về RoFinance', 'Back to RoFinance')}><BrandLogo decorative className="h-11 w-11 shrink-0"/><span>RoFinance <small>ADMIN</small></span></a>
      <div className="admin-header-actions">
        <button className="admin-control" onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')} aria-label={t('Chuyển sang tiếng Anh', 'Switch to Vietnamese')}>{language === 'vi' ? 'EN' : 'VI'}</button>
        <button className="admin-control" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('Đổi giao diện sáng tối', 'Toggle light and dark theme')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
        {overview && <button className="admin-control" disabled={hasPending} onClick={logout} aria-label={t('Đăng xuất', 'Sign out')}><LogOut size={18}/></button>}
      </div>
    </header>
    {hasPending && <p className="admin-pending-note" role="status">{t('Có thao tác đang xử lý hoặc chưa xác định kết quả. Vào Tài khoản để kiểm tra cùng yêu cầu trước khi rời trang.', 'An operation is processing or its outcome is uncertain. Open Accounts to reconcile the same request before leaving.')}</p>}
    {status !== 'ready' || !overview ? <main className="admin-access" id="admin-content" aria-live="polite">
      <div className="admin-access-icon"><LockKeyhole size={32}/></div>
      <p className="admin-eyebrow">RoFinance Admin</p>
      <h1>{status === 'loading' ? t('Đang kiểm tra quyền truy cập', 'Checking access') : status === 'signing-out' ? t('Đang đăng xuất', 'Signing out') : status === 'login' ? t('Bạn cần đăng nhập', 'Sign in required') : status === 'forbidden' ? t('Không có quyền truy cập', 'Access denied') : t('Chưa thể tải trang quản trị', 'Admin is unavailable')}</h1>
      <p>{status === 'forbidden' ? t('Tài khoản này không được cấp quyền quản trị.', 'This account is not authorized for administration.') : status === 'login' ? t('Đăng nhập tại ứng dụng, sau đó mở lại /admin.', 'Sign in to the app, then reopen /admin.') : status === 'error' ? t('Không hiển thị dữ liệu khi chưa xác minh được quyền truy cập.', 'Data stays hidden until access is verified.') : t('Quyền được xác minh trực tiếp bởi backend.', 'Access is verified directly by the backend.')}</p>
      <div className="admin-access-actions"><a className="admin-button" href="/" onClick={guardNavigation} aria-disabled={hasPending}><ArrowLeft size={16}/>{t('Về ứng dụng', 'Back to app')}</a>{!['loading', 'signing-out'].includes(status) && !signingOut.current && <button className="admin-button" onClick={() => void refresh()}><RefreshCw size={16}/>{t('Thử lại', 'Try again')}</button>}</div>
    </main> : <div className="admin-layout">
      <aside className="admin-sidebar"><div><p className="admin-eyebrow">{t('Không gian quản trị', 'Administration')}</p><nav aria-label={t('Mục quản trị', 'Admin sections')}>
        <button className="admin-nav" aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}><LayoutDashboard size={19}/>{t('Tổng quan', 'Overview')}</button>
        <button className="admin-nav" aria-current={tab === 'catalogue' ? 'page' : undefined} onClick={() => setTab('catalogue')}><Gift size={19}/>{t('Danh mục vật phẩm', 'Item catalogue')}</button>
        {(overview.mode === 'operations' || overview.operationsEnabled) && <><button className="admin-nav" aria-current={tab === 'accounts' ? 'page' : undefined} onClick={() => setTab('accounts')}><Users size={19}/>{t('Tài khoản', 'Accounts')}</button><button className="admin-nav" aria-current={tab === 'audit' ? 'page' : undefined} onClick={() => setTab('audit')}><BookOpen size={19}/>{t('Lịch sử quản trị', 'Admin audit trail')}</button></>}
      </nav></div><div className="admin-sidebar-note"><ShieldCheck size={21}/><strong>{t('Một chủ sở hữu', 'Single owner')}</strong><p>{t('Phân quyền ở backend. Không có quyền admin phụ.', 'Backend authorization. No secondary administrators.')}</p></div></aside>
      <main className="admin-main" id="admin-content">
        <div className="admin-page-heading"><div><p className="admin-eyebrow">{t('Bảng điều khiển', 'Control centre')}</p><h1>{tab === 'overview' ? t('Tổng quan hệ thống', 'System overview') : tab === 'catalogue' ? t('Danh mục vật phẩm', 'Item catalogue') : tab === 'accounts' ? t('Quản lý tài khoản', 'Account management') : t('Lịch sử quản trị', 'Admin audit trail')}</h1><p>{t('Công cụ vận hành, không truy cập dữ liệu tài chính cá nhân.', 'Operational tools without access to personal financial data.')}</p></div><button className="admin-button" disabled={Boolean(pending.current)} onClick={() => void refresh()}><RefreshCw size={16}/>{t('Làm mới', 'Refresh')}</button></div>
        <div className="admin-policy"><ShieldCheck size={18}/><span>{t('Đã xác minh quyền truy cập', 'Access verified')}<small>{(overview.mode === 'operations' || overview.operationsEnabled) ? t('Thao tác có xác nhận và lịch sử', 'Confirmed and audited operations') : t('Chế độ chỉ đọc', 'Read-only mode')}</small></span></div>
        {tab === 'overview' ? <>
          <section className="admin-metrics" aria-label={t('Chỉ số hệ thống', 'System metrics')}>
            {[{ label: t('Tài khoản', 'Accounts'), value: overview.counts.accounts, icon: Users, note: t('Tổng số tài khoản', 'Registered accounts') },
              { label: t('Nhân vật', 'Characters'), value: overview.counts.characters, icon: Activity, note: t('Hồ sơ đã khởi tạo', 'Created character profiles') },
              { label: t('Vật phẩm', 'Items'), value: overview.catalogue.total, icon: Gift, note: t(`${overview.catalogue.signature} món Signature`, `${overview.catalogue.signature} Signature pieces`) },
              { label: t('Lượt quay · 7 ngày', 'Draws · 7 days'), value: overview.counts.drawsLast7Days, icon: RefreshCw, note: t('Chỉ tính lượt đã ghi nhận', 'Committed draws only') }].map(({ label, value, icon: Icon, note }) => <article className="admin-metric" key={label}><div><span>{label}</span><Icon size={20}/></div><strong>{count(value)}</strong><p>{note}</p></article>)}
          </section>
          <div className="admin-panels"><section className="admin-panel"><h2><Database size={19}/>{t('Trạng thái hệ thống', 'System status')}</h2><dl><div><dt>{t('Backend & cơ sở dữ liệu', 'Backend & database')}</dt><dd className="admin-positive">{t('Đã phản hồi', 'Responding')}</dd></div><div><dt>{t('Người tham gia xếp hạng', 'Ranking participants')}</dt><dd>{count(overview.counts.rankingParticipants)}</dd></div><div><dt>{t('Cập nhật lúc · giờ Việt Nam', 'Updated · Vietnam time')}</dt><dd>{date(overview.generatedAt)}</dd></div><div><dt>{t('Bản API', 'API release')}</dt><dd className="admin-code" title={overview.release.apiRevision}>{overview.release.apiRevision.slice(0, 12)}</dd></div><div><dt>{t('Bản web', 'Web release')}</dt><dd className="admin-code">{overview.release.webRevision?.slice(0, 12) ?? t('Chưa có', 'Unavailable')}</dd></div></dl></section>
          <section className="admin-panel admin-privacy"><h2><ShieldCheck size={19}/>{t('Ranh giới bảo mật', 'Security boundaries')}</h2><p>{t('Không hiển thị thu nhập, chi tiêu, số dư, tài khoản ngân hàng hoặc thông tin đăng nhập của bất kỳ người dùng nào.', 'No user income, expenses, balances, bank accounts or credentials are displayed.')}</p><ul><li>{t('Xác thực phiên hoặc JWT hợp lệ.', 'Valid session or JWT required.')}</li><li>{t('Kiểm tra đúng ID và email trong cơ sở dữ liệu.', 'Account ID and stored email are checked.')}</li><li>{t('Không sửa tài chính. Thao tác quản trị đều có xác nhận và lịch sử.', 'No financial edits. Administration operations are confirmed and audited.')}</li></ul></section></div>
          <button className="admin-catalogue-shortcut" onClick={() => setTab('catalogue')}><BookOpen size={23}/><span><strong>{t('Khám phá danh mục vật phẩm', 'Browse the item catalogue')}</strong><small>{t(`${overview.catalogue.prizes} phần thưởng · ${overview.catalogue.hidden} món ẩn`, `${overview.catalogue.prizes} prizes · ${overview.catalogue.hidden} hidden items`)}</small></span><ChevronRight size={20}/></button>
        </> : tab === 'accounts' || tab === 'audit' ? <AdminOperations key={tab} view={tab} language={language} pending={pending} onPendingChange={pendingChanged} onDenied={code => { ++generation.current; request.current?.abort(); setOverview(null); setStatus(code === 401 ? 'login' : 'forbidden'); }}/> : <section className="admin-panel admin-catalogue">
          <div className="admin-filters"><label className="admin-search"><span>{t('Tìm vật phẩm', 'Find an item')}</span><div><Search size={18}/><input type="search" value={search} placeholder={t('Tên hoặc ID vật phẩm', 'Item name or ID')} onChange={event => { setSearch(event.target.value); setPage(1); }}/></div></label>
            <label><span>{t('Bậc vật phẩm', 'Rarity')}</span><select value={rarity} onChange={event => { setRarity(event.target.value as Rarity | ''); setPage(1); }}><option value="">{t('Tất cả bậc', 'All rarities')}</option>{RARITIES.map(value => <option value={value} key={value}>{rarityName(value)}</option>)}</select></label>
            <label><span>{t('Vị trí trang bị', 'Equipment slot')}</span><select value={slot} onChange={event => { setSlot(event.target.value as ItemSlot | ''); setPage(1); }}><option value="">{t('Tất cả vị trí', 'All slots')}</option>{ITEM_SLOTS.map(value => <option value={value} key={value}>{slotName(value)}</option>)}</select></label>
          </div>
          <p className="admin-result-count" aria-live="polite">{t(`${count(filtered.length)} vật phẩm`, `${count(filtered.length)} items`)}</p>
          <div className="admin-item-grid">{visible.map(item => <article className="admin-item" key={item.id} data-item-id={item.id} data-rarity={item.rarity}><CosmeticArtwork item={item} title={language === 'vi' ? item.vi : item.en} size={72} effects={false}/><div><strong>{language === 'vi' ? item.vi : item.en}</strong><code>{item.id}</code><span className="admin-rarity">{rarityName(item.rarity)} · {slotName(item.slot)}</span><span className="admin-item-badge">{item.exclusive ? 'Signature' : item.secret ? t('Vật phẩm ẩn', 'Hidden item') : item.starter ? t('Đồ cơ bản', 'Starter item') : t('Phần thưởng', 'Prize')}</span></div></article>)}</div>
          {!filtered.length && <p className="admin-empty">{t('Không có vật phẩm phù hợp.', 'No matching items.')}</p>}
          <nav className="admin-pagination" aria-label={t('Phân trang vật phẩm', 'Item pagination')}><button className="admin-control" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label={t('Trang trước', 'Previous page')}><ChevronLeft size={19}/></button><span>{t('Trang', 'Page')} {currentPage} / {pages}</span><button className="admin-control" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} aria-label={t('Trang tiếp', 'Next page')}><ChevronRight size={19}/></button></nav>
        </section>}
        <footer className="admin-footer"><LockKeyhole size={14}/>{t('Dữ liệu không lưu vào bộ nhớ cục bộ. Mọi yêu cầu được kiểm tra quyền lại.', 'Data is not stored locally. Every request is reauthorized.')}</footer>
      </main>
    </div>}
  </div>;
}
