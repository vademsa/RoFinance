import React from 'react';
import type { Cosmetic } from '../../../shared/character';
import { cosmeticTheme } from '../../utils/cosmeticPresentation';
import { SignatureLogo } from './SignatureDetails';

/** Decorative SVG scenery, shared by the isolated item and dressed character. */
export function CosmeticBackdrop({ item }: { item: Cosmetic }) {
  const theme = cosmeticTheme(item);
  if (theme === 'plain') return null;
  return <svg className="cosmetic-backdrop" data-theme={theme} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g className="cosmetic-backdrop-stars" fill="var(--theme-light)">
      {[ [12, 15], [79, 12], [88, 44], [18, 68], [68, 81], [38, 10], [9, 42] ].map(([x, y]) => <path key={`${x}-${y}`} d={`M${x} ${y - 2}v4m-2-2h4`} stroke="var(--theme-light)" strokeWidth="1"/>)}
    </g>
    {theme === 'signature' && <g fill="none" stroke="var(--theme-main)"><path d="M50 5L91 27V73L50 95L9 73V27Z M50 11L85 31V69L50 89L15 69V31Z" strokeWidth="2"/><path d="M19 31h13M68 31h13M19 69h13M68 69h13" stroke="var(--theme-light)" strokeWidth="2"/><g stroke="none"><SignatureLogo x={43} y={9} scale={2.4}/></g></g>}
    {(theme === 'celestial' || theme === 'astral') && <g fill="none" stroke="var(--theme-main)"><path d="M8 72Q42 4 91 27Q60 92 8 72Z" strokeWidth="3" opacity=".6"/><path d="M18 20L35 35L76 15L84 60L62 82" strokeWidth="1"/>{[ [18,20],[35,35],[76,15],[84,60],[62,82] ].map(([x,y]) => <circle key={x} cx={x} cy={y} r="2" fill="var(--theme-light)"/>)}</g>}
    {theme === 'comet' && <g fill="var(--theme-light)"><path d="M80 12L44 46L72 16L22 62L58 48Z" opacity=".65"/><path d="M23 63l4-11 4 8 8 2-8 4-3 8-2-8z"/></g>}
    {theme === 'aurora' && <g fill="none" strokeWidth="10" opacity=".65"><path d="M-10 35Q20 4 43 30T110 15" stroke="var(--theme-main)"/><path d="M-10 50Q26 15 56 47T110 34" stroke="var(--theme-light)"/><path d="M-10 70Q30 27 62 62T110 53" stroke="#818cf8"/></g>}
    {theme === 'orbit' && <g fill="none" stroke="var(--theme-light)"><circle cx="50" cy="50" r="24" strokeWidth="2"/><ellipse cx="50" cy="50" rx="45" ry="17" transform="rotate(-32 50 50)" strokeWidth="3"/><circle cx="16" cy="69" r="5" fill="var(--theme-main)"/><circle cx="76" cy="15" r="7" fill="var(--theme-main)"/></g>}
    {theme === 'phoenix' && <g fill="var(--theme-main)"><path d="M50 87Q16 77 12 35L34 54L24 12L46 43L50 8L57 43L78 12L68 54L91 32Q86 80 50 87Z" opacity=".7"/><path d="M50 86L28 60L47 65L51 31L56 65L76 58Z" fill="var(--theme-light)"/></g>}
    {theme === 'singularity' && <g><circle cx="50" cy="50" r="26" fill="var(--theme-main)"/><circle cx="50" cy="50" r="20" fill="#020617"/><ellipse cx="50" cy="50" rx="44" ry="10" fill="none" stroke="var(--theme-light)" strokeWidth="3" transform="rotate(-24 50 50)"/><circle cx="50" cy="50" r="30" fill="none" stroke="var(--theme-main)" opacity=".55"/></g>}
    {theme === 'dragon' && <g fill="var(--theme-main)"><path d="M9 75L28 53L18 18L42 40L57 31L61 12L70 33L85 25L77 44L90 55L75 58L62 74L48 70L36 87L31 66Z" opacity=".75"/><path d="M52 36L71 41L61 47L68 55L54 54L49 68L44 52Z" fill="var(--theme-light)"/><rect x="61" y="40" width="3" height="3" fill="#020617"/></g>}
    {theme === 'eclipse' && <g><circle cx="50" cy="50" r="32" fill="var(--theme-main)" opacity=".4"/><circle cx="50" cy="50" r="25" fill="var(--theme-light)"/><circle cx="55" cy="45" r="24" fill="#020617"/><circle cx="50" cy="50" r="37" fill="none" stroke="var(--theme-main)" opacity=".5"/></g>}
  </svg>;
}
