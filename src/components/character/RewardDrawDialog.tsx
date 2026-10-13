import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleDashed, Gift, X } from 'lucide-react';
import { COSMETICS, DRAW_COST, type CharacterProfile, type DrawResult, type ItemSlot } from '../../../shared/character';
import { CosmeticArtwork } from './CosmeticArtwork';
import { RewardReel } from './RewardReel';
import { characterError, label, rarityLabels, type CharacterLanguage } from './characterText';

export function RewardDrawDialog({ profile, language, opening, confirmed, result, onSettled, onClose, onWardrobe, returnFocus,
  runId, startedAt, busy, pendingKind, error, onDraw }: {
  profile: CharacterProfile; language: CharacterLanguage; opening: boolean; confirmed: DrawResult | null; result: DrawResult | null;
  onSettled: (outcome: DrawResult) => void; onClose: () => void; onWardrobe: (slot: ItemSlot) => void;
  returnFocus: HTMLElement | null;
  runId: number; startedAt: number | null; busy: boolean; pendingKind?: 'draw' | 'exchange' | 'recycle' | 'fuse'; error: string | null; onDraw: () => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const dialog = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false);
  const pointerOutside = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const drawButton = useRef<HTMLButtonElement>(null);
  const remainingDraws = Math.floor(profile.availablePoints / DRAW_COST);
  const canDraw = !busy && !opening && (pendingKind === 'draw' || (!pendingKind && remainingDraws > 0));
  const item = result && COSMETICS.find((entry) => entry.id === result.itemId);
  useEffect(() => {
    const element = dialog.current!;
    // Capture before the trigger is disabled; disabling it can blur focus
    // before this mount effect runs. A consumed retry button may disappear.
    const previous = returnFocus;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal(); setReady(true);
    return () => { element.close(); document.body.style.overflow = overflow;
      const canRestore = previous?.isConnected && !previous.matches(':disabled, [aria-disabled="true"]') && !previous.closest('[inert]') && previous.getClientRects().length > 0;
      const destination = canRestore ? previous : document.querySelector<HTMLElement>('.character-tabs [aria-pressed="true"]');
      destination?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (opening) body.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [opening, runId]);
  useEffect(() => {
    // The button disappears while spinning; put keyboard focus back inside the
    // modal when the next draw completes rather than leaving it on the page.
    if (!opening) (canDraw ? drawButton.current : dialog.current?.querySelector<HTMLButtonElement>('header button'))?.focus({ preventScroll: true });
  }, [opening, result, canDraw]);
  const outside = (event: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  return createPortal(<dialog ref={dialog} className="character-feature character-catalogue-dialog reward-draw-dialog" data-no-translate="true" aria-labelledby="reward-draw-title"
    onCancel={(event) => { event.preventDefault(); if (!opening) onClose(); }}
    onPointerDown={(event) => { pointerOutside.current = event.target === event.currentTarget && outside(event); }}
    onClick={(event) => { if (!opening && pointerOutside.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
    <header className="character-catalogue-header"><div><h2 id="reward-draw-title">{t('Quay thưởng', 'Reward draw')}</h2>
      <p className="character-muted">{opening ? t('Vật phẩm dừng tại vạch giữa là kết quả của bạn.', 'The item stopped at the centre marker is your result.') : result ? t('Kết quả đã được hệ thống xác nhận.', 'Your result has been confirmed by the server.') : pendingKind === 'draw' ? t('Lượt quay đang chờ xác nhận lại.', 'This draw is awaiting confirmation.') : t('Backend kiểm tra điểm cho từng lượt quay.', 'The server checks your points on every draw.')}</p></div>
      <button type="button" autoFocus className="character-button" disabled={opening} aria-label={t('Đóng kết quả', 'Close draw result')} onClick={onClose}><X size={20}/></button></header>
    <div ref={body} className="character-catalogue-body character-stack">
      {!opening && !result && !pendingKind && !error && <div className="reward-draw-ready"><Gift size={64}/><h3>{t('Sẵn sàng khám phá?', 'Ready to discover?')}</h3>
        <p>{t('Nhấn Bắt đầu quay để sử dụng 20 điểm. Có thể không trúng vật phẩm. Kết quả do hệ thống quyết định.', 'Choose Start draw to spend 20 points. A draw can be empty. The server determines your result.')}</p></div>}
      {(opening || result) && <RewardReel key={runId} profile={profile} language={language} startedAt={startedAt} ready={ready} opening={opening} confirmed={confirmed} result={result} onSettled={onSettled}/>}
      {error && !opening && <p className="character-message" role="alert">{characterError(error, language)}</p>}
      {pendingKind === 'draw' && !opening && <p className="character-note">{t('Lượt này chưa được xác nhận. Xác nhận lại để nhận đúng kết quả, không trừ điểm thêm.', 'This draw is awaiting confirmation. Confirm again for the same result without another debit.')}</p>}
      {item && result && !opening && <div className="reward-result reward-reveal" role="status" data-secret={Boolean(item.secret)} data-exclusive={Boolean(item.exclusive)} data-rarity={item.rarity}>
        <p className="character-eyebrow">{item.secret ? t('ĐÃ KHÁM PHÁ VẬT PHẨM BÍ MẬT', 'SECRET ITEM DISCOVERED') : result.duplicate ? t('NHẬN VẬT PHẨM TRÙNG', 'DUPLICATE ITEM RECEIVED') : t('CHÚC MỪNG! BẠN ĐÃ TRÚNG', 'CONGRATULATIONS! YOU WON')}</p>
        <CosmeticArtwork item={item} title={language === 'en' ? item.en : item.vi} size={168}/>
        <h3>{language === 'en' ? item.en : item.vi}</h3><span className="character-rarity">{label(rarityLabels[item.rarity], language)}</span>
        {item.exclusive && <span className="signature-badge">{t('Độc quyền RoFinance', 'RoFinance exclusive')}</span>}
        <p className="character-muted">{result.duplicate ? result.fragments === 5 ? t('Kết quả cũ · đã nhận 5 mảnh.', 'Legacy result · 5 fragments were added.') : t('Đã sở hữu · thêm 1 bản dư để phân giải hoặc ghép.', 'Already owned · 1 spare copy added for recycling or fusion.') : t('Vật phẩm mới đã vào tủ đồ.', 'New item added to your wardrobe.')}</p>
      </div>}
      {result && result.itemId === null && !opening && <div className="reward-result reward-reveal" role="status" data-empty="true">
        <CircleDashed size={64}/><h3>{t('Không trúng vật phẩm', 'No item won')}</h3>
        <p className="character-muted">{t('Đã dùng 20 điểm. Không nhận vật phẩm hoặc mảnh. Tủ đồ và trang phục hiện tại được giữ nguyên.', '20 points spent. No item or fragments awarded. Your inventory and equipped outfit are unchanged.')}</p>
      </div>}
    </div>
    <footer className="character-catalogue-footer reward-draw-footer">
      <div className="reward-draw-options"><span className="character-muted" role="status">{t('Lượt còn lại', 'Draws remaining')}: {remainingDraws}</span></div>
      {opening ? <button type="button" className="character-button" disabled><Gift size={16}/>{t('Đang quay…', 'Spinning…')}</button>
        : <><button type="button" className="character-button" onClick={onClose}>{t('Đóng', 'Close')}</button>
          <button ref={drawButton} type="button" className="character-button character-button-primary reward-draw-again" disabled={!canDraw} onClick={onDraw}><Gift size={16}/>
            {pendingKind === 'draw' ? t('Xác nhận lại lượt quay', 'Confirm draw again') : result ? t('Quay tiếp', 'Draw again') : t('Bắt đầu quay', 'Start draw')} · {DRAW_COST} {t('điểm', 'points')}</button>
          {item && <button type="button" className="character-button character-button-primary" onClick={() => { onClose(); onWardrobe(item.slot); }}>{t('Xem trong tủ đồ', 'View in wardrobe')}</button>}</>}
    </footer>
  </dialog>, document.body);
}
