import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, LockKeyhole, Shirt, X } from 'lucide-react';
import { COSMETICS, EXCHANGE_COST, ITEM_SLOTS, RARITIES, canExchangeCosmetic, cosmeticGender,
  type CosmeticGender, type CharacterId, type CharacterProfile, type Equipment, type ItemSlot, type Rarity } from '../../../shared/character';
import { paginateCharacterItems } from '../../utils/characterPagination';
import { CollectionPagination } from './CollectionPagination';
import { CosmeticArtwork } from './CosmeticArtwork';
import { CosmeticCard } from './CosmeticCard';
import { genderLabels, label, rarityLabels, slotLabels, type CharacterLanguage } from './characterText';
import { ClothingGenderFilter } from './ClothingGenderFilter';

export function RewardCatalogueDialog({ profile, language, characterId, equipped, busy, pending, message, onClose, onPreview, onExchange }: {
  profile: CharacterProfile; language: CharacterLanguage; characterId: CharacterId; equipped: Equipment; busy: boolean;
  pending: { kind: 'draw' | 'exchange' | 'recycle' | 'fuse'; itemId?: string } | null; message?: string;
  onClose: () => void; onPreview: (id: string) => void; onExchange: (id: string) => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const dialog = useRef<HTMLDialogElement>(null);
  const pointerOutside = useRef(false);
  const [rarity, setRarity] = useState<Rarity | ''>('');
  const [slot, setSlot] = useState<ItemSlot | ''>('');
  const [gender, setGender] = useState<CosmeticGender | ''>('');
  const [requestedPage, setPage] = useState(1);
  const scrollBody = useRef<HTMLDivElement>(null);
  const items = COSMETICS.filter((item) => !item.starter && (!item.secret || profile.ownedItemIds.includes(item.id)) && (!rarity || item.rarity === rarity) && (!slot || item.slot === slot) && (!gender || cosmeticGender(item) === gender));
  const pagination = paginateCharacterItems(items, requestedPage);
  const secretItems = COSMETICS.filter((item) => item.secret);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const outside = (event: React.PointerEvent<HTMLDialogElement> | React.MouseEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  const changePage = (page: number) => { setPage(page); scrollBody.current?.scrollTo({ top: 0 }); };
  return createPortal(<dialog ref={dialog} className="character-feature character-catalogue-dialog" data-no-translate="true" aria-labelledby="reward-catalogue-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { pointerOutside.current = event.target === event.currentTarget && outside(event); }}
    onClick={(event) => { if (pointerOutside.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
    <header className="character-catalogue-header"><div><h2 id="reward-catalogue-title">{t('Danh sách phần thưởng', 'Reward catalogue')}</h2>
      <p className="character-muted">{t('Khám phá vật phẩm và các bộ trang phục.', 'Explore items and outfit collections.')}</p></div>
      <button type="button" className="character-button" autoFocus aria-label={t('Đóng phần thưởng', 'Close rewards')} onClick={onClose}><X size={20}/></button></header>
    <div className="character-catalogue-body character-stack reward-catalogue" ref={scrollBody}>
      <div className="reward-rarity-tabs" aria-label={t('Nhóm giải thưởng', 'Reward rarity')}>
        <button type="button" aria-pressed={!rarity} onClick={() => { setRarity(''); changePage(1); }}>{t('Tất cả phần thưởng', 'All prizes')}</button>
        {RARITIES.map((tier) => <button type="button" key={tier} aria-pressed={rarity === tier} data-rarity={tier} onClick={() => { setRarity(tier); changePage(1); }}>{label(rarityLabels[tier], language)}</button>)}
      </div>
      <label className="character-form-label">{t('Lọc loại vật phẩm', 'Filter item category')}
        <select className="character-select" aria-label={t('Lọc loại vật phẩm', 'Filter item category')} value={slot} onChange={(event) => { setSlot(event.target.value as ItemSlot | ''); changePage(1); }}>
          <option value="">{t('Tất cả vật phẩm', 'All item categories')}</option>
          {ITEM_SLOTS.map((itemSlot) => <option key={itemSlot} value={itemSlot}>{label(slotLabels[itemSlot], language)}</option>)}
        </select>
      </label>
      <ClothingGenderFilter value={gender} language={language} onChange={value => { setGender(value); changePage(1); }}/>
      <details className="reward-secret-notice"><summary><HelpCircle size={16}/><strong>{t(`${secretItems.length} vật phẩm bí mật`, `${secretItems.length} secret items`)}</strong></summary><div>
        <p>{t('Tên và hình chỉ hiện sau khi sở hữu.', 'Names and artwork appear only after you own them.')}</p></div></details>
      {message && <p className="character-message" role="status">{message}</p>}
      <div className="reward-prize-grid">
        {pagination.items.map((item) => {
          const owned = profile.ownedItemIds.includes(item.id);
          return <CosmeticCard className="reward-prize" item={item} language={language} key={item.id}>
            <button type="button" className="reward-prize-preview" aria-label={`${t('Thử', 'Preview')} ${language === 'en' ? item.en : item.vi}`} onClick={() => onPreview(item.id)}>
              <CosmeticArtwork item={item} size={64} title={language === 'en' ? item.en : item.vi}/>
            </button>
            <h3>{language === 'en' ? item.en : item.vi}</h3>
            <span className="character-muted">{label(genderLabels[cosmeticGender(item)], language)}</span>
            <span className="character-muted">{owned ? t('Đã sở hữu · +1 bản dư khi trùng', 'Owned · +1 spare when duplicated') : t('Chưa sở hữu', 'Not owned')}</span>
            {owned ? <button type="button" className="character-button" onClick={() => onPreview(item.id)}><Shirt size={14}/>{t('Mặc thử', 'Try on')}</button>
              : !canExchangeCosmetic(item) ? <span className="character-note">{t('Nhận qua quay hoặc ghép đồ', 'Draw or fusion reward')}</span>
                : <button type="button" className="character-button" disabled={busy || (profile.fragments < EXCHANGE_COST && !pending) || Boolean(pending && (pending.kind !== 'exchange' || pending.itemId !== item.id))} onClick={() => onExchange(item.id)}><LockKeyhole size={14}/>{t('Đổi', 'Exchange')} · {EXCHANGE_COST} {t('mảnh', 'fragments')}</button>}
          </CosmeticCard>;
        })}
      </div>
      {!pagination.total && <p className="character-note">{t('Không có vật phẩm phù hợp với bộ lọc.', 'No items match these filters.')}</p>}
      <p className="character-note">{t('Đồ trùng được giữ thành bản dư: phân giải 2 bản để nhận 20 điểm hoặc ghép 7 bản cùng độ hiếm. Mảnh cũ vẫn được giữ; 20 mảnh đổi đồ công khai chưa sở hữu, trừ Huyền thoại. Vật phẩm không tăng thứ hạng.',
        'Duplicates are kept as spare copies: recycle 2 for 20 points or fuse 7 of the same rarity. Legacy fragments are retained; 20 exchange an unowned public item except Legendary. Cosmetics do not raise rank.')}</p>
    </div>
    <footer className="character-catalogue-footer"><CollectionPagination {...pagination} language={language} label={t('Phân trang phần thưởng', 'Reward catalogue pagination')} onPage={changePage}/></footer>
  </dialog>, document.body);
}
