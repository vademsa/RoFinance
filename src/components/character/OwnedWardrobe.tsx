import React, { useEffect, useState } from 'react';
import { Check, Gift, Shirt } from 'lucide-react';
import { COSMETICS, ITEM_SLOTS, cosmeticGender, type CosmeticGender, type CharacterProfile, type CharacterId, type Equipment, type ItemSlot, type MaterialKind } from '../../../shared/character';
import { paginateCharacterItems } from '../../utils/characterPagination';
import { CosmeticArtwork } from './CosmeticArtwork';
import { CosmeticCard } from './CosmeticCard';
import { CollectionPagination } from './CollectionPagination';
import { genderLabels, label, rarityLabels, slotLabels, type CharacterLanguage } from './characterText';
import { ClothingGenderFilter } from './ClothingGenderFilter';

export function OwnedWardrobe({ profile, language, characterId, equipped, slot, onSlot, onPreview, onRemove, onOpenCatalogue, onMaterials, materialsDisabled }: {
  profile: CharacterProfile; language: CharacterLanguage; characterId: CharacterId; equipped: Equipment; slot: ItemSlot | '';
  onSlot: (slot: ItemSlot | '') => void; onPreview: (itemId: string) => void; onRemove: (slot: 'hat' | 'backpack') => void;
  onOpenCatalogue?: () => void;
  onMaterials?: (kind: MaterialKind, itemId: string) => void; materialsDisabled?: boolean;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const [requestedPage, setPage] = useState(1);
  const [gender, setGender] = useState<CosmeticGender | ''>('');
  useEffect(() => { setPage(1); }, [slot]);
  const owned = COSMETICS.filter((item) => profile.ownedItemIds.includes(item.id) && (!slot || item.slot === slot) && (!gender || cosmeticGender(item) === gender));
  const pagination = paginateCharacterItems(owned, requestedPage);
  return <section className="character-owned-collection" aria-labelledby="owned-collection-title">
    <div className="character-heading-row"><div><h2 id="owned-collection-title" className="text-base font-extrabold">{t('Vật phẩm của bạn', 'Your items')}</h2>
      <p className="character-muted">{profile.ownedItemIds.length}/{COSMETICS.length} {t('vật phẩm đã sở hữu', 'items owned')} · {profile.fragments} {t('mảnh vật phẩm', 'fragments')}</p></div>
      {onOpenCatalogue && <button type="button" className="character-button" onClick={onOpenCatalogue}><Gift size={16}/>{t('Xem phần thưởng', 'View rewards')}</button>}
    </div>
    <div className="character-slots" aria-label={t('Loại vật phẩm', 'Item category')}>
      <button type="button" aria-pressed={!slot} onClick={() => { onSlot(''); setPage(1); }}>{t('Tất cả', 'All items')}</button>
      {ITEM_SLOTS.map((itemSlot) => <button key={itemSlot} type="button" aria-pressed={slot === itemSlot} onClick={() => { onSlot(itemSlot); setPage(1); }}>{label(slotLabels[itemSlot], language)}</button>)}
    </div>
    <ClothingGenderFilter value={gender} language={language} onChange={value => { setGender(value); setPage(1); }}/>
    {(slot === 'hat' || slot === 'backpack') && <button type="button" className="character-button mt-3" onClick={() => onRemove(slot)}>{t('Tháo phụ kiện', 'Remove accessory')}</button>}
    <div className="character-item-grid">
      {pagination.items.map((item) => {
        const selected = equipped[item.slot] === item.id;
        return <CosmeticCard className="character-item" item={item} language={language} key={item.id}>
          <button type="button" className="character-item-preview" aria-pressed={selected} aria-label={`${t('Thử', 'Preview')} ${language === 'en' ? item.en : item.vi}`} onClick={() => onPreview(item.id)}>
            <CosmeticArtwork item={item} size={84} title={language === 'en' ? item.en : item.vi}/>
          </button>
          <h3>{language === 'en' ? item.en : item.vi}</h3>
          {item.secret && <span className="character-rarity">{t('Bí mật đã khám phá', 'Secret discovered')}</span>}
          <span className="character-rarity">{label(rarityLabels[item.rarity], language)} · {t('Đã sở hữu', 'Owned')}</span>
          <span className="character-muted text-xs">{label(genderLabels[cosmeticGender(item)], language)}</span>
          {(profile.duplicateItemCounts?.[item.id] ?? 0) > 0 && <span className="character-muted text-xs">+{profile.duplicateItemCounts![item.id]} {t('bản dư', 'spare copies')}</span>}
          <button type="button" className="character-button" onClick={() => onPreview(item.id)}>{selected ? <Check size={14}/> : <Shirt size={14}/>} {selected ? t('Đang thử', 'Previewing') : t('Mặc thử', 'Try on')}</button>
          {onMaterials && !item.starter && (profile.duplicateItemCounts?.[item.id] ?? 0) > 0 && <div className="character-material-actions">
            <button type="button" className="character-button" disabled={materialsDisabled} aria-label={`${t('Phân giải', 'Recycle')} ${language === 'en' ? item.en : item.vi}`} onClick={() => onMaterials('recycle', item.id)}>{t('Phân giải', 'Recycle')}</button>
            {item.rarity !== 'legendary' && <button type="button" className="character-button" disabled={materialsDisabled} aria-label={`${t('Ghép đồ', 'Fuse')} ${language === 'en' ? item.en : item.vi}`} onClick={() => onMaterials('fuse', item.id)}>{t('Ghép đồ', 'Fuse')}</button>}
          </div>}
        </CosmeticCard>;
      })}
    </div>
    {!pagination.total && <p className="character-note mt-4">{t('Bạn chưa sở hữu vật phẩm nào thuộc loại này.', 'You do not own any items in this category yet.')}</p>}
    <CollectionPagination {...pagination} onPage={setPage} language={language} label={t('Phân trang vật phẩm đã sở hữu', 'Owned items pagination')}/>
    <p className="character-note mt-4">{t('Chỉ hiển thị đồ đã sở hữu. Xem toàn bộ giải thưởng và đổi bằng mảnh trong popup phần thưởng. Vật phẩm chỉ thay đổi ngoại hình, không tăng điểm xếp hạng.',
      'Only owned items are shown here. Browse prizes and exchange fragments in the rewards popup. Cosmetics change appearance only, not ranking scores.')}</p>
  </section>;
}
