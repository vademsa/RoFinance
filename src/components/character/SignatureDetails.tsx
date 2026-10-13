import React from 'react';
import type { Cosmetic } from '../../../shared/character';

/** Pixel R mark, not text/font-dependent, reused on every canonical set item. */
export function SignatureLogo({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return <g data-signature-logo="R" transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M0 0h4v1h1v3H4v1H3l2 2H3L1 5v2H0zM1 1v3h3V1z" fill="#5c410a" fillRule="evenodd"/>
    <path d="M0 0h4v1H0zM0 1h1v6H0z" fill="#fff4c2"/>
  </g>;
}

/** Shared, bounded metallic tailoring for isolated artwork and dressed sprites. */
export function SignatureDetails({ item }: { item: Cosmetic }) {
  const gold = '#d4af37', silver = '#f8fafc', shade = '#64748b';
  const marks = {
    shirt: [29, 48, 1.2], hat: [30, 13, .9], shoes: [24, 65, .7], hair: [39, 20, .65],
    face: [39, 26, .65], expression: [20, 29, .65], backpack: [14, 48, 1],
  } as const;
  const [x, y, scale] = marks[item.slot];
  return <g data-collection-detail={item.id} data-signature-detail={item.slot}>
    {item.slot === 'shirt' && <><path d="M23 43h6l3 5 4-5h7v16H23z" fill={shade}/><path d="M24 44h4l4 6 5-6h5v14H24z" fill="#cbd5e1"/><path d="M23 43h6l3 5 4-5h7M23 59h20M18 52h5M43 52h5" stroke={gold} strokeWidth="1.3"/><rect x="25" y="46" width="2" height="10" fill={silver}/><rect x="39" y="46" width="2" height="10" fill={silver}/></>}
    {item.slot === 'hat' && <><path d="M20 20h26v3H20zM24 13h19v7H24zM25 10h17v3H25z" fill={gold}/><path d="M26 11h15v7H26z" fill={silver}/><rect x="21" y="21" width="23" height="1" fill={silver}/></>}
    {item.slot === 'shoes' && <><path d="M22 64h9v9H21v-2h1zM35 64h10v9H34v-2h1z" fill={shade}/><path d="M23 65h7v6h-7zM36 65h8v6h-8z" fill="#cbd5e1"/><path d="M21 72h11v2H21zM34 72h12v2H34z" fill={gold}/><rect x="36" y="66" width="7" height="1" fill={silver}/></>}
    {item.slot === 'hair' && <><path d="M23 18h20v5H23zM21 24h3v8h-3zM43 24h3v8h-3z" fill={shade}/><path d="M25 18h3v5h-3zM31 18h3v4h-3zM37 18h3v4h-3z" fill={silver}/><path d="M23 23h20" stroke={gold}/></>}
    {item.slot === 'backpack' && <><path d="M11 44h10v17H11z" fill={gold}/><path d="M12 45h8v15h-8z" fill={shade}/><rect x="13" y="46" width="6" height="12" fill="#cbd5e1"/><rect x="12" y="45" width="8" height="1" fill={silver}/></>}
    {item.slot === 'face' && <><path d="M24 27h7v5h-7zM35 27h7v5h-7zM31 28h4v1h-4z" fill={gold}/><path d="M25 28h5v3h-5zM36 28h5v3h-5z" fill="#334155"/><path d="M25 28h5M36 28h5" stroke={silver}/></>}
    {item.slot === 'expression' && <><path d="M19 28h2v8h-2zM17 31h6v2h-6zM45 26h2v7h-2zM43 28h6v2h-6z" fill={gold}/><rect x="45" y="27" width="1" height="2" fill={silver}/></>}
    <SignatureLogo x={x} y={y} scale={scale}/>
    <g className="signature-glints" fill={silver} aria-hidden="true">
      <path d={`M${x - 3} ${y + 1}h1v-2h1v2h1v1h-1v2h-1v-2h-1z`}/>
      <path d={`M${x + 8} ${y + 6}h1v-1h1v1h1v1h-1v1h-1v-1h-1z`}/>
    </g>
  </g>;
}
