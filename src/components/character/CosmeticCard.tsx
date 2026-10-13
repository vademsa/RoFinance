import React, { useId, useState } from 'react';
import type { Cosmetic } from '../../../shared/character';
import { cosmeticHonour } from '../../utils/cosmeticPresentation';
import { label, rarityLabels, type CharacterLanguage } from './characterText';

export function CosmeticCard({ item, language, className, children }: { item: Cosmetic; language: CharacterLanguage; className: string; children: React.ReactNode }) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const name = language === 'en' ? item.en : item.vi;
  return <article className={`${className} cosmetic-titled`} data-rarity={item.rarity} data-secret={Boolean(item.secret)} data-exclusive={Boolean(item.exclusive)} data-item-id={item.id}
    tabIndex={0} aria-label={name} aria-describedby={id}
    onMouseEnter={() => { if (window.matchMedia('(hover: hover)').matches) setHovered(true); }} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setPinned(false); } }}
    onClick={(event) => {
      if (window.matchMedia('(hover: none)').matches && !(event.target as Element).closest('button, select, input, a')) {
        setPinned((current) => !current); setFocused(false);
      }
    }}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setPinned((current) => !current); setFocused(false); }
      if (event.key === 'Escape' && (hovered || focused || pinned)) { event.preventDefault(); event.stopPropagation(); setHovered(false); setFocused(false); setPinned(false); }
    }}>
    {children}
    {item.exclusive && <span className="signature-badge">{language === 'en' ? 'RoFinance exclusive' : 'Độc quyền RoFinance'}</span>}
    <span id={id} role="tooltip" className="cosmetic-title-tooltip" data-visible={hovered || focused || pinned}>
      <span className="character-muted">{language === 'en' ? 'COSMETIC TITLE' : 'DANH HIỆU NGOẠI HÌNH'}</span>
      <strong className="cosmetic-honour">{cosmeticHonour(item, language)}</strong>
      <span>{label(rarityLabels[item.rarity], language)} · {language === 'en' ? 'No ranking bonus' : 'Không cộng điểm xếp hạng'}</span>
    </span>
  </article>;
}
