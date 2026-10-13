import React from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { DRAW_COST,
  type CharacterProfile } from '../../../shared/character';
import { type CharacterLanguage } from './characterText';

export function RewardDrawPanel({ profile, language, busy, opening, pendingKind, onDraw, onShowRewards }: {
  profile: CharacterProfile; language: CharacterLanguage; busy: boolean; opening: boolean;
  pendingKind?: 'draw' | 'exchange' | 'recycle' | 'fuse'; onDraw: () => void;
  onShowRewards: () => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  return <div className="character-stack reward-panel">
    <div className="character-stat-grid"><div className="character-stat"><span>{t('Điểm thưởng', 'Reward points')}</span><strong>{profile.availablePoints}</strong></div>
      <div className="character-stat"><span>{t('Mảnh vật phẩm', 'Fragments')}</span><strong>{profile.fragments}</strong></div>
      <div className="character-stat"><span>{t('Lượt đã quay', 'Draws made')}</span><strong>{profile.drawCount}</strong></div></div>
    <div className="character-card character-stack reward-machine">
      <div><span className="character-eyebrow">{t('20 ĐIỂM · 1 LƯỢT · KHÔNG DÙNG TIỀN THẬT', '20 POINTS · 1 DRAW · NO REAL MONEY')}</span>
        <h2 className="flex items-center gap-2 mt-2"><Sparkles size={18}/>{t('Vòng quay vật phẩm', 'Pixel item reel')}</h2></div>
      <button type="button" className="character-button" onClick={onShowRewards} aria-haspopup="dialog"><Gift size={16}/>{t('Xem phần thưởng', 'View rewards')}</button>
      <button type="button" className="character-button character-button-primary reward-draw-button" onClick={onDraw}
        disabled={busy || opening || (!pendingKind && profile.availablePoints < DRAW_COST) || Boolean(pendingKind && pendingKind !== 'draw')}>
        <Gift size={18}/>{opening ? t('Đang quay…', 'Spinning…') : pendingKind === 'draw' ? t('Xác nhận lại lượt quay', 'Confirm draw again') : `${t('Quay thưởng', 'Draw an item')} · ${DRAW_COST} ${t('điểm', 'points')}`}
      </button>
    </div>
  </div>;
}
