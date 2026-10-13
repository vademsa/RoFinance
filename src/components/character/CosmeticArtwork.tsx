import React from 'react';
import type { Cosmetic } from '../../../shared/character';
import { CostumeDetails } from './CostumeDetails';
import { CosmeticBackdrop } from './CosmeticBackdrop';
import { cosmeticAura, cosmeticTheme, themeColors } from '../../utils/cosmeticPresentation';
import { CosmeticAura } from './CosmeticAura';
import { LegendaryAttachmentArtwork } from './LegendaryAttachment';
import { attachmentViewBox, legendaryAttachment } from '../../utils/legendaryAttachments';
export { cosmeticAura } from '../../utils/cosmeticPresentation';

/** Isolated, code-native item art, using the same coordinates/details as the outfit. */
export function CosmeticArtwork({ item, title, size = 84, effects = true }: { item: Cosmetic; title: string; size?: number; effects?: boolean }) {
  const { slot, color, variant: v } = item;
  const attachment = legendaryAttachment(item);
  const viewBoxes = { shirt: '15 39 36 24', hat: '15 2 38 25', shoes: '18 61 31 16', hair: '17 12 33 37', backpack: '4 38 24 28', face: '17 20 33 24', expression: '17 20 33 24' };
  const phase = item.id.split('').reduce((value, char) => value + char.charCodeAt(0), 0) % 8;
  const theme = cosmeticTheme(item);
  const [main, light] = themeColors[theme];
  return <div className="cosmetic-artwork" data-effects={effects ? 'full' : 'none'} data-theme={theme} data-rarity={item.rarity} data-aura={cosmeticAura(item)} data-cosmetic-id={item.id} style={{ width: size, height: size, '--aura-delay': `${-phase}s`, '--theme-main': main, '--theme-light': light } as React.CSSProperties}>
    {effects && <><CosmeticBackdrop item={item}/><CosmeticAura/></>}
    <svg viewBox={attachmentViewBox(item) || (slot === 'shirt' && item.gender === 'female' ? '15 39 36 31' : viewBoxes[slot])} width={size * (attachment ? .85 : .7)} height={size * (attachment ? .85 : .7)} role="img" aria-label={title} shapeRendering="crispEdges" className="cosmetic-sprite">
      <title>{title}</title>
      {attachment && <LegendaryAttachmentArtwork item={item}/>}
      {slot === 'shirt' && <g fill={color}><path d="M23 42h7v3h7v-3h7l5 2v12h-6v5H23v-5h-6V44z"/>
        {v === 1 && <rect x="23" y="50" width="20" height="3" fill="#d1fae5"/>}
        {v === 2 && <><rect x="32" y="45" width="2" height="13" fill="#fff"/><rect x="26" y="53" width="4" height="3" fill="#be185d"/></>}
        {v === 3 && <path d="M30 49h6v6h-6zM32 47h2v10h-2z" fill="#fffbeb"/>}
        {v === 4 && <><rect x="24" y="46" width="4" height="12" fill="#2dd4bf"/><rect x="28" y="48" width="5" height="9" fill="#a78bfa"/><rect x="33" y="46" width="5" height="10" fill="#f0abfc"/><rect x="38" y="48" width="4" height="9" fill="#67e8f9"/></>}
      </g>}
      {slot === 'hat' && !attachment && !item.gender && <g fill={color}>{v === 3 ? <path d="M20 18h27v3H20zM25 13h16v5H25zM28 8h10v5H28zM31 5h4v3h-4z"/> : <path d="M23 15h20v7H23zM25 13h16v2H25zM18 21h27v2H18z"/>}
        {v === 1 && <rect x="23" y="19" width="20" height="2" fill="#d1fae5"/>}{v === 2 && <rect x="30" y="9" width="6" height="5"/>}
        {v === 4 && <><path d="M23 12h4v7h-4zM31 9h4v10h-4zM39 12h4v7h-4z" fill="#c4b5fd"/><path d="M32 7h2v6h-2zM30 9h6v2h-6z" fill="#fef3c7"/><rect x="45" y="6" width="2" height="2" fill="#67e8f9"/></>}
      </g>}
      {slot === 'shoes' && <g fill={color}><rect x="21" y={v === 2 ? 65 : 69} width="11" height={v === 2 ? 8 : 4}/><rect x="34" y={v === 2 ? 65 : 69} width="12" height={v === 2 ? 8 : 4}/><path d="M21 73h11v1H21zM34 73h12v1H34z" fill="#25283d"/>{v !== 0 && <path d="M24 69h4v1h-4zM37 69h4v1h-4z" fill="#fff"/>}</g>}
      {slot === 'hair' && !item.gender && <g fill={v === 0 ? '#49382c' : color}><path d="M22 18h22v24h-4V24H26v18h-4zM23 20h20v3H23zM23 22h7v4h-7z"/>{v === 1 && <path d="M20 24h4v23h-4zM42 24h4v23h-4z"/>}{v === 2 && <rect x="40" y="14" width="8" height="8"/>}{v === 3 && <path d="M26 17h4v4h-4zM34 16h4v4h-4z"/>}</g>}
      {slot === 'backpack' && !attachment && <g fill={color}><rect x="16" y="42" width="9" height="20" fill="#25283d"/><rect x="17" y="43" width="8" height="17"/><rect x="14" y="46" width="6" height="13"/><rect x="15" y="50" width="4" height="6" fill="#fff" opacity=".35"/>{v === 4 && <><rect x="9" y="50" width="11" height="6" fill="#a5b4fc"/><rect x="12" y="48" width="6" height="10" fill="#312e81"/><rect x="14" y="51" width="3" height="4" fill="#67e8f9"/></>}</g>}
      {(slot === 'face' || slot === 'expression') && <g><path d="M25 21h16v2h2v15h-2v3H25v-3h-2V23h2z" fill="#edb98a"/><path d="M27 28h2v3h-2zM37 28h2v3h-2z" fill={slot === 'face' && v === 3 ? '#92400e' : '#25283d'}/><path d="M29 34h2v2h-2zM36 34h2v2h-2zM31 36h5v1h-5z" fill="#25283d"/>
        {slot === 'face' && v === 1 && <path d="M26 27h5v5h-5zM36 27h5v5h-5z" fill={color}/>}
        {slot === 'face' && v === 2 && <path d="M24 33h3v1h-3zM39 33h3v1h-3z" fill={color}/>}
        {slot === 'expression' && v === 1 && <rect x="31" y="36" width="5" height="2" fill="#25283d"/>}
        {slot === 'expression' && v === 2 && <path d="M26 28h4v1h-4zM36 28h4v1h-4z" fill={color}/>}
        {slot === 'expression' && v === 3 && <path d="M24 33h3v2h-3zM40 33h2v2h-2z" fill={color}/>}
      </g>}
      {!attachment && <CostumeDetails item={item}/>}
    </svg>
  </div>;
}
