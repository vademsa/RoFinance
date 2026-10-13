import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { assessFinance, vietnamDate, DEFAULT_EQUIPMENT, type CharacterProfile, type FinanceForCharacter } from '../../../shared/character';
import { PixelCharacter } from './PixelCharacter';
import { EquippedAura } from './EquippedAura';
import { label, moodLabels, type CharacterLanguage } from './characterText';
import './character.css';

export function CharacterCompanion({ profile, finance, language, onOpen }: {
  profile: CharacterProfile | null; finance: FinanceForCharacter; language: CharacterLanguage; onOpen: () => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const assessment = assessFinance(finance, vietnamDate());
  return <button type="button" onClick={onOpen} className="character-feature character-companion" data-no-translate="true">
    <span className="character-companion-portrait"><EquippedAura equipped={profile?.equipped || DEFAULT_EQUIPMENT} ownedItemIds={profile?.ownedItemIds || []} size={48}/><PixelCharacter characterId={profile?.characterId} gender={profile?.gender} equipped={profile?.equipped || DEFAULT_EQUIPMENT}
      mood={assessment.mood} size={48} title={t('Nhân vật đồng hành', 'Your pixel companion')}/></span>
    <span className="character-companion-copy"><span className="character-eyebrow">{t('BẠN ĐỒNG HÀNH', 'YOUR COMPANION')}</span>
      <span className="character-companion-heading">{profile?.nickname || t('Hồ sơ nhân vật', 'Character profile')}</span>
      <span className="character-muted">{label(moodLabels[assessment.mood], language)} · {t('Mở tủ đồ và phần thưởng', 'Open wardrobe and rewards')}</span>
    </span><ArrowUpRight size={18} aria-hidden="true"/>
  </button>;
}
