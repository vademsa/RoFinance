import React from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { COSMETICS, type ItemMaterial, type MaterialKind, type MaterialResult } from '../../../shared/character';
import type { MaterialPhase } from '../../hooks/useMaterialReveal';
import { materialCopies } from '../../utils/materialWorkshop';
import { CosmeticArtwork } from './CosmeticArtwork';
import { label, rarityLabels, type CharacterLanguage } from './characterText';

export function MaterialReveal({ phase, materials, result, kind, language }: {
  phase: MaterialPhase; materials: ItemMaterial[]; result: MaterialResult | null; kind: MaterialKind; language: CharacterLanguage;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const copies = materialCopies(materials);
  const prize = result?.itemId ? COSMETICS.find((item) => item.id === result.itemId) : null;
  const revealed = phase === 'revealing' || phase === 'complete';
  return <section className="material-reveal" data-phase={phase} data-kind={kind} aria-busy={!revealed} aria-label={t('Kết quả thao tác vật phẩm', 'Item action result')}>
    <div className="material-reveal-scene" aria-hidden={!revealed}>
      {!revealed && <>
        {copies.map((id, index) => {
          const item = COSMETICS.find((entry) => entry.id === id)!;
          const angle = index * 2 * Math.PI / copies.length - Math.PI / 2;
          return <div key={`${id}:${index}`} className="material-orbit-item" data-item-id={id}
            style={{ '--material-x': `${Math.cos(angle) * 104}px`, '--material-y': `${Math.sin(angle) * 104}px`, '--material-delay': `${index * 25}ms` } as React.CSSProperties}>
            <CosmeticArtwork item={item} title={language === 'en' ? item.en : item.vi} size={52} effects={false}/>
          </div>;
        })}
        <div className="material-energy"><Sparkles size={32}/></div>
        <div className="material-light"/>
      </>}
      {revealed && result && <div className="duplicate-result" data-item-id={result.itemId ?? ''} data-rarity={prize?.rarity ?? 'points'} data-exclusive={Boolean(prize?.exclusive)} role="status">
        <p className="character-eyebrow">{kind === 'fuse' ? t('GHÉP THÀNH CÔNG', 'FUSION COMPLETE') : t('PHÂN GIẢI THÀNH CÔNG', 'RECYCLING COMPLETE')}</p>
        {prize ? <>
          <CosmeticArtwork item={prize} size={160} title={language === 'en' ? prize.en : prize.vi}/>
          <h3>{language === 'en' ? prize.en : prize.vi}</h3>
          <span className="character-rarity">{label(rarityLabels[prize.rarity], language)}</span>
          {prize.exclusive && <span className="signature-badge">{t('Độc quyền RoFinance', 'RoFinance exclusive')}</span>}
          <p className="character-muted">{result.duplicate ? t('Đã sở hữu · thêm 1 bản dư vào kho.', 'Already owned · 1 spare copy added to your inventory.') : t('Vật phẩm mới đã vào tủ đồ.', 'New item added to your wardrobe.')}</p>
        </> : <><div className="material-points"><Coins size={76}/></div><h3>+{result.points} {t('điểm thưởng', 'reward points')}</h3>
          <p className="character-muted">{t('Điểm đã được cộng. Trang bị gốc và đồ đang mặc được giữ nguyên.', 'Points have been credited. Original and equipped items are unchanged.')}</p></>}
      </div>}
    </div>
    {!revealed && <p className="material-phase-caption" role="status">{phase === 'gathering'
      ? kind === 'fuse' ? t('Đang gom 7 bản dư…', 'Gathering 7 spare copies…') : t('Đang phân giải 2 bản dư…', 'Recycling 2 spare copies…')
      : phase === 'waiting' ? t('Đang chờ xác nhận từ hệ thống…', 'Awaiting server confirmation…') : t('Năng lượng đang hội tụ…', 'Energy is converging…')}</p>}
  </section>;
}
