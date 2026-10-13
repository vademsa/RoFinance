import React from 'react';
import { Sparkles } from 'lucide-react';
import { ITEM_SLOTS, type Equipment } from '../../../shared/character';
import { OUTFIT_SETS, equippedOutfitSet, outfitSetOwnedCount } from '../../utils/outfitSets';
import type { CharacterLanguage } from './characterText';

export function OutfitSets({ equipped, ownedItemIds, language, disabled, onPreview }: {
  equipped: Equipment; ownedItemIds: string[]; language: CharacterLanguage; disabled: boolean; onPreview: (items: Equipment) => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const active = equippedOutfitSet(equipped, ownedItemIds);
  const completed = OUTFIT_SETS.filter((set) => outfitSetOwnedCount(set, ownedItemIds) === ITEM_SLOTS.length).length;
  return <div className="character-set-collection">
    {active && <p className="character-set-active" role="status"><Sparkles size={15} aria-hidden="true"/>
      {language === 'en' ? active.en : active.vi} · {t('Hiệu ứng bộ đang bật', 'Full set effect active')}</p>}
    <details className="character-set-details">
      <summary><Sparkles size={15} aria-hidden="true"/><strong>{t('Bộ sưu tập trang phục', 'Outfit sets')}</strong><span>{completed}/{OUTFIT_SETS.length}</span></summary>
      <p className="character-muted">{t('Sở hữu và mặc đủ 7 món cùng bộ để bật hiệu ứng. Mặc thử bộ rồi lưu trang phục; không dùng điểm.',
        'Own and wear all 7 matching items to activate the effect. Preview a set, then save your outfit; no points are spent.')}</p>
      <ul className="character-set-list" aria-label={t('Tiến độ sưu tập bộ', 'Set collection progress')}>
        {OUTFIT_SETS.map((set) => {
          const count = outfitSetOwnedCount(set, ownedItemIds);
          const name = language === 'en' ? set.en : set.vi;
          return <li key={set.id} data-set-id={set.id} data-complete={count === ITEM_SLOTS.length} data-active={active?.id === set.id}>
            <div><strong>{name}</strong><span>{count}/{ITEM_SLOTS.length} · {active?.id === set.id ? t('Đang mặc', 'Equipped')
              : count === ITEM_SLOTS.length ? t('Đã đủ bộ', 'Collected') : t('Đang sưu tập', 'Collecting')}</span></div>
            <button type="button" className="character-button" aria-label={`${t('Mặc thử bộ', 'Preview set')} ${name}`} disabled={disabled || count !== ITEM_SLOTS.length || active?.id === set.id}
              onClick={() => onPreview({ ...set.items })}>{t('Mặc bộ', 'Wear set')}</button>
          </li>;
        })}
      </ul>
    </details>
  </div>;
}
