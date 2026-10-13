import React from 'react';
import type { Equipment } from '../../../shared/character';
import { cosmeticAura, cosmeticTheme, equippedAuraItem, equippedAuraItems, themeColors } from '../../utils/cosmeticPresentation';
import { CosmeticAura } from './CosmeticAura';
import { CosmeticBackdrop } from './CosmeticBackdrop';
import { legendaryAttachment } from '../../utils/legendaryAttachments';
import { equippedOutfitSet } from '../../utils/outfitSets';
import { FullSetEffect } from './FullSetEffect';

/** Decorative only: equipment remains controlled by the existing save/API flow. */
export function EquippedAura({ equipped, size = 170, ownedItemIds }: { equipped: Equipment; size?: number; ownedItemIds?: readonly string[] }) {
  const dominant = equippedAuraItem(equipped);
  const set = equippedOutfitSet(equipped, ownedItemIds);
  if (!dominant && !set) return null;
  // Coordinates follow the character's 64 × 80 SVG, not the surrounding card.
  const regions = {
    hat: [10, -2, 46, 32], shirt: [8, 32, 50, 35], shoes: [18, 64, 31, 15],
    backpack: [5, 36, 30, 30], hair: [17, 13, 32, 32], face: [20, 21, 27, 23], expression: [20, 21, 27, 23],
  } as const;
  return <div className="equipped-aura" aria-hidden="true" data-aura={dominant ? cosmeticAura(dominant) : 'neutral'} data-cosmetic-id={dominant?.id}
    style={{ width: size, height: size * 1.25 }}>
    {set && <FullSetEffect set={set}/>}
    {equippedAuraItems(equipped).map((item) => {
      const theme = cosmeticTheme(item);
      const [main, light] = themeColors[theme];
      const phase = item.id.split('').reduce((value, char) => value + char.charCodeAt(0), 0) % 8;
      const [x, y, width, height] = item.slot === 'backpack' && legendaryAttachment(item) ? [0, 22, 64, 48] : regions[item.slot];
      const glowOnly = ['shoes', 'hair', 'face', 'expression'].includes(item.slot);
      return <div key={item.id} className="cosmetic-artwork equipped-slot-aura" data-slot={item.slot} data-theme={theme} data-rarity={item.rarity}
        data-aura={cosmeticAura(item)} data-cosmetic-id={item.id} data-effect={glowOnly ? 'glow' : 'aura'}
        style={{ left: x * size / 64, top: y * size / 64, width: width * size / 64, height: height * size / 64,
          '--aura-delay': `${-phase}s`, '--theme-main': main, '--theme-light': light } as React.CSSProperties}>
        {glowOnly ? <><i className="equipped-local-glow"/>{item.slot === 'shoes' && <i className="equipped-local-glow"/>}</>
          : <><CosmeticBackdrop item={item}/><CosmeticAura/></>}
      </div>;
    })}
  </div>;
}
