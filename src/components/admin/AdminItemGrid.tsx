import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { COSMETICS } from '../../../shared/character';
import { CosmeticArtwork } from '../character/CosmeticArtwork';

type Entry = { itemId: string; copies?: number; equipped?: boolean };
/** Canonical artwork shared with the character wardrobe; never client-supplied URLs. */
export function AdminItemGrid({ items, language, selected, onSelect, inventory = false }: {
  items: Entry[]; language: 'vi' | 'en'; selected?: string; onSelect: (id: string) => void; inventory?: boolean;
}) {
  const t = (vi: string, en: string) => language === 'vi' ? vi : en;
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const rows = items.flatMap(entry => { const item = COSMETICS.find(c => c.id === entry.itemId); return item ? [{ ...entry, item }] : []; });
  if (inventory) rows.sort((a, b) => Number(Boolean(a.item.starter)) - Number(Boolean(b.item.starter)) || Number(Boolean(b.equipped)) - Number(Boolean(a.equipped)));
  const filtered = rows.filter(({ item }) => `${item.vi} ${item.en} ${item.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 6)); const current = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [search]);
  return <section className="admin-visual-items" aria-label={inventory ? t('Kho đồ tài khoản', 'Account inventory') : t('Chọn vật phẩm bằng hình ảnh', 'Visual item selection')}>
    <label>{inventory ? t('Tìm trong kho', 'Search inventory') : t('Tìm vật phẩm để tặng', 'Search gifts')}<input type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)}/></label>
    <div className="admin-visual-grid">{filtered.slice((current - 1) * 6, current * 6).map(({ item, copies, equipped }) => <button type="button" key={item.id} className="admin-visual-item" aria-pressed={selected === item.id} disabled={Boolean(item.starter)} onClick={() => onSelect(item.id)} title={item.id}>
      <CosmeticArtwork item={item} title={language === 'vi' ? item.vi : item.en} size={56} effects={false}/>
      <strong>{language === 'vi' ? item.vi : item.en}</strong>
      {copies !== undefined && <span>×{copies}{equipped ? t(' · đang mặc', ' · equipped') : ''}</span>}
      <small>{item.starter ? t('Đồ cơ bản · không thu hồi', 'Basic · cannot revoke') : ({ common: t('Thường', 'Common'), rare: t('Hiếm', 'Rare'), special: t('Đặc biệt', 'Special'), legendary: t('Huyền thoại', 'Legendary') })[item.rarity]}</small>
    </button>)}</div>
    {!filtered.length && <p className="admin-notice">{t('Không có vật phẩm phù hợp.', 'No matching items.')}</p>}
    <nav className="admin-pagination" aria-label={inventory ? t('Phân trang kho đồ', 'Inventory pagination') : t('Phân trang vật phẩm tặng', 'Gift pagination')}><button type="button" className="admin-control" disabled={current <= 1} aria-label={t('Trang vật phẩm trước', 'Previous items')} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button><span>{current} / {pages} · {filtered.length}</span><button type="button" className="admin-control" disabled={current >= pages} aria-label={t('Trang vật phẩm tiếp', 'Next items')} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button></nav>
  </section>;
}
