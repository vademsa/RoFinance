import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Recycle, Sparkles, Trash2, X } from 'lucide-react';
import { COSMETICS, RARITIES, FUSE_COPIES, RECYCLE_COPIES, type CharacterProfile, type ItemMaterial, type MaterialKind, type MaterialResult, type Rarity } from '../../../shared/character';
import type { PendingCharacterAction } from '../../../shared/characterReceipt';
import { CHARACTER_PAGE_SIZE, paginateCharacterItems } from '../../utils/characterPagination';
import { changeWorkshopQuantity, materialCopies, workshopMaterials } from '../../utils/materialWorkshop';
import { useMaterialReveal } from '../../hooks/useMaterialReveal';
import { CollectionPagination } from './CollectionPagination';
import { CosmeticArtwork } from './CosmeticArtwork';
import { CosmeticCard } from './CosmeticCard';
import { MaterialReveal } from './MaterialReveal';
import { label, rarityLabels, type CharacterLanguage } from './characterText';

export function DuplicateWorkshop({ profile, language, busy, pending, kind, itemId, message, onClose, onTransform }: {
  profile: CharacterProfile; language: CharacterLanguage; busy: boolean; pending: PendingCharacterAction | null;
  kind: MaterialKind; itemId: string; message?: string; onClose: () => void;
  onTransform: (kind: MaterialKind, items: ItemMaterial[]) => Promise<MaterialResult | null>;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const name = (item: typeof COSMETICS[number]) => language === 'en' ? item.en : item.vi;
  const source = COSMETICS.find((item) => item.id === itemId);
  const dialog = useRef<HTMLDialogElement>(null);
  const pointerOutside = useRef(false);
  const [rarity, setRarity] = useState<Rarity>(source?.rarity === 'legendary' ? 'common' : source?.rarity ?? 'common');
  const [quantities, setQuantities] = useState<Record<string, number>>(() => ({ [itemId]: Math.min(profile.duplicateItemCounts?.[itemId] ?? 0, kind === 'recycle' ? RECYCLE_COPIES : FUSE_COPIES) }));
  const [page, setPage] = useState(() => {
    const candidates = COSMETICS.filter((item) => !item.starter && profile.ownedItemIds.includes(item.id) && (profile.duplicateItemCounts?.[item.id] ?? 0) > 0 && (kind === 'recycle' || item.rarity === source?.rarity));
    return Math.max(1, Math.floor(candidates.findIndex((item) => item.id === itemId) / CHARACTER_PAGE_SIZE) + 1);
  });
  const [review, setReview] = useState(false);
  const reveal = useMaterialReveal(onTransform);
  const counts = profile.duplicateItemCounts ?? {};
  const needed = kind === 'recycle' ? RECYCLE_COPIES : FUSE_COPIES;
  const materials = COSMETICS.filter((item) => !item.starter && profile.ownedItemIds.includes(item.id) && (counts[item.id] ?? 0) > 0 && (kind === 'recycle' || item.rarity === rarity));
  const selected = workshopMaterials(profile, kind, rarity, quantities);
  const basket = pending?.kind === kind ? pending.items! : selected;
  const copies = materialCopies(basket);
  const total = selected.reduce((sum, entry) => sum + entry.count, 0);
  const pagination = paginateCharacterItems(materials, page);
  const locked = busy || reveal.running;
  const disabled = locked || Boolean(pending);
  const setQuantity = (id: string, quantity: number) => {
    if (disabled || review) return;
    setQuantities((current) => changeWorkshopQuantity(profile, kind, rarity, current, id, quantity));
  };
  const reset = () => { setQuantities({}); setPage(1); setReview(false); reveal.reset(); };
  const submit = (entries: ItemMaterial[]) => { setReview(false); void reveal.run(kind, entries); };
  useEffect(() => {
    if (reveal.phase === 'complete') setQuantities({});
  }, [reveal.phase]);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal();
    return () => {
      element.close(); document.body.style.overflow = previousOverflow;
      const canRestore = previousFocus?.isConnected && previousFocus !== document.body && previousFocus !== document.documentElement && !previousFocus.matches(':disabled, [aria-disabled="true"]') && !previousFocus.closest('[inert]') && previousFocus.getClientRects().length > 0;
      const destination = canRestore ? previousFocus : document.querySelector<HTMLElement>('.character-tabs [aria-pressed="true"]');
      destination?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (reveal.phase === 'complete') dialog.current?.querySelector<HTMLButtonElement>('.material-continue')?.focus({ preventScroll: true });
    else if (reveal.phase === 'idle' && pending) dialog.current?.querySelector<HTMLButtonElement>('.material-retry')?.focus({ preventScroll: true });
    else if (reveal.running) dialog.current?.focus({ preventScroll: true });
  }, [reveal.phase, pending]);
  const outside = (event: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  return createPortal(<dialog ref={dialog} tabIndex={-1} className="character-feature character-catalogue-dialog duplicate-workshop" data-no-translate="true" aria-labelledby="duplicate-workshop-title"
    onKeyDown={(event) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const candidates = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
      const first = candidates[0], last = candidates.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (!candidates.includes(document.activeElement as HTMLElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }}
    onCancel={(event) => { event.preventDefault(); if (!locked) onClose(); }}
    onPointerDown={(event) => { pointerOutside.current = event.target === event.currentTarget && outside(event); }}
    onClick={(event) => { if (!locked && pointerOutside.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
    <header className="character-catalogue-header"><div><h2 id="duplicate-workshop-title">{kind === 'recycle' ? t('Phân giải vật phẩm', 'Recycle items') : t('Ghép vật phẩm', 'Fuse items')}</h2>
      <p className="character-muted">{kind === 'fuse' ? t('7 bản dư cùng độ hiếm → 1 vật phẩm ngẫu nhiên ở bậc kế tiếp.', '7 same-rarity spare copies → 1 random next-tier item.') : t('2 bản dư → 20 điểm thưởng.', '2 spare copies → 20 reward points.')}</p></div>
      <button type="button" className="character-button" autoFocus disabled={locked} aria-label={t('Đóng thao tác vật phẩm', 'Close item action')} onClick={onClose}><X size={20}/></button></header>
    <div className="character-catalogue-body material-body">
      {reveal.phase !== 'idle' ? <MaterialReveal kind={kind} language={language} phase={reveal.phase} materials={reveal.materials} result={reveal.result}/>
        : <>
          {message && <p className="character-message character-error" role="alert">{message}</p>}
          {pending && <div className="character-message" role="status">{t('Thao tác đang chờ xác nhận. Nguyên liệu được giữ theo mã giao dịch; không tiêu thêm bản dư.', 'An action is awaiting confirmation. Materials are tied to its receipt; no extra spare copies are consumed.')}
            {pending.kind === kind && <button type="button" className="character-button material-retry" disabled={locked} onClick={() => submit(pending.items!)}>{t('Xác nhận lại', 'Confirm again')}</button>}</div>}
          <div className="material-toolbar">
            {kind === 'fuse' && <label className="character-form-label">{t('Độ hiếm nguyên liệu', 'Material rarity')}<select className="character-select" value={rarity} disabled={disabled || review} onChange={(event) => { reset(); setRarity(event.target.value as Rarity); }}>
              {RARITIES.filter((tier) => tier !== 'legendary').map((tier) => <option key={tier} value={tier}>{label(rarityLabels[tier], language)} → {label(rarityLabels[RARITIES[RARITIES.indexOf(tier) + 1]], language)}</option>)}
            </select></label>}
            <p className="character-muted">{t('Chỉ dùng bản dư. Đồ gốc và trang bị đang mặc không bị mất.', 'Only spare copies are used. Original and equipped items are kept.')}</p>
          </div>
          <div className="material-workspace">
            <section className="material-inventory" aria-labelledby="material-inventory-title">
              <h3 id="material-inventory-title">{t('Kho đồ của bạn', 'Your inventory')}</h3>
              <div className="material-inventory-scroll" inert={disabled || review}>
                <div className="character-item-grid duplicate-materials">
                  {pagination.items.map((item) => {
                    const count = selected.find((entry) => entry.itemId === item.id)?.count ?? 0;
                    const maximum = Math.min(counts[item.id], needed - total + count);
                    return <CosmeticCard item={item} language={language} key={item.id} className="character-item material-inventory-card">
                      <button type="button" className="material-add" aria-label={t('Thêm', 'Add') + ' ' + name(item)} disabled={disabled || review || count >= maximum} onClick={() => setQuantity(item.id, count + 1)}>
                        <CosmeticArtwork item={item} size={56} title={name(item)}/><h4>{name(item)}</h4>
                        <span className="character-rarity">{label(rarityLabels[item.rarity], language)} · {counts[item.id]} {t('bản dư', 'spares')}</span>
                        <span className="material-add-label"><Plus size={14}/>{t('Thêm', 'Add')}</span>
                      </button>
                      <label className="material-quantity">{t('Số bản', 'Copies')}<select className="character-select" aria-label={t('Số bản', 'Copies') + ' ' + name(item)} value={count} disabled={disabled || review} onChange={(event) => setQuantity(item.id, Number(event.target.value))}>
                        {Array.from({ length: maximum + 1 }, (_, amount) => <option key={amount} value={amount}>{amount}</option>)}
                      </select></label>
                    </CosmeticCard>;
                  })}
                </div>
                {!materials.length && <p className="character-muted material-empty">{t('Chưa có bản dư phù hợp.', 'No matching spare copies yet.')}</p>}
              </div>
              <div inert={disabled || review}><CollectionPagination {...pagination} onPage={setPage} language={language} label={t('Phân trang bản dư', 'Spare copies pagination')}/></div>
            </section>
            <section className="material-basket" aria-labelledby="material-basket-title">
              <h3 id="material-basket-title">{t('Nguyên liệu đã chọn', 'Selected materials')} <span>{copies.length}/{needed}</span></h3>
              <div className="material-basket-scroll"><div className="material-slots">
                {Array.from({ length: needed }, (_, index) => {
                  const item = COSMETICS.find((candidate) => candidate.id === copies[index]);
                  return item ? <button type="button" key={index} className="material-slot" data-item-id={item.id} data-rarity={item.rarity}
                    disabled={disabled || review} aria-label={t('Bỏ', 'Remove') + ' ' + name(item) + ' · ' + (index + 1)} onClick={() => setQuantity(item.id, (selected.find((entry) => entry.itemId === item.id)?.count ?? 0) - 1)}>
                    <CosmeticArtwork item={item} size={48} effects={false} title={name(item)}/><span className="material-slot-remove"><X size={12}/></span>
                  </button> : <div key={index} className="material-slot material-slot-empty" aria-label={t('Ô trống', 'Empty slot') + ' ' + (index + 1)}><Plus size={20}/><span>{index + 1}</span></div>;
                })}
              </div><p className="character-muted material-basket-hint">{t('Bấm đồ trong kho để thêm; bấm ô đã chọn để bỏ ra.', 'Tap inventory items to add; tap selected copies to remove.')}</p></div>
              <button type="button" className="character-button material-clear" disabled={disabled || review || total === 0} onClick={() => setQuantities({})}><Trash2 size={16}/>{t('Bỏ chọn hết', 'Clear selection')}</button>
            </section>
          </div>
          {review && <p className="character-note material-review" role="status">{kind === 'recycle' ? t('Dùng đúng 2 bản dư đã chọn để nhận 20 điểm thưởng?', 'Consume the 2 selected spare copies for 20 reward points?') : t('Dùng đúng 7 bản dư đã chọn? Vật phẩm nhận được có thể trùng.', 'Consume the 7 selected spare copies? The resulting item may be a duplicate.')}</p>}
        </>}
    </div>
    <footer className="character-catalogue-footer material-footer">
      {reveal.phase === 'complete' ? <><button type="button" className="character-button" onClick={onClose}>{t('Đóng', 'Close')}</button><button type="button" className="character-button character-button-primary material-continue" disabled={busy || Boolean(pending)} onClick={reset}>{kind === 'fuse' ? t('Ghép tiếp', 'Fuse again') : t('Phân giải tiếp', 'Recycle again')}</button></>
        : reveal.running ? <button type="button" className="character-button" disabled><Sparkles size={16}/>{t('Đang xử lý…', 'Processing…')}</button>
          : <><span className="character-muted">{t('Đã chọn', 'Selected')}: {copies.length}/{needed}</span>
            {review ? <><button type="button" className="character-button" disabled={disabled} onClick={() => setReview(false)}>{t('Hủy', 'Cancel')}</button>
              <button type="button" className="character-button character-button-primary" disabled={disabled || total !== needed} onClick={() => submit(selected)}>{kind === 'recycle' ? <Recycle size={16}/> : <Sparkles size={16}/>} {kind === 'recycle' ? t('Xác nhận phân giải', 'Confirm recycling') : t('Xác nhận ghép đồ', 'Confirm fusion')}</button></>
              : <button type="button" className="character-button character-button-primary" disabled={disabled || total !== needed} onClick={() => setReview(true)}>{kind === 'recycle' ? t('Phân giải 2 bản dư', 'Recycle 2 spare copies') : t('Ghép 7 bản dư', 'Fuse 7 spare copies')}</button>}
          </>}
    </footer>
  </dialog>, document.body);
}
