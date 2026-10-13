import React from 'react';
import type { Cosmetic } from '../../../shared/character';

/** Shared code-native shapes for catalogue sprites and dressed portraits. */
export function GenderedCostumeDetails({ item }: { item: Cosmetic }) {
  const female = item.gender === 'female'; const color = item.color; const accent = '#f8fafc';
  let art: React.ReactNode;
  switch (item.slot) {
    case 'shirt': art = female ? <><path d="M25 44h16v11l6 12H19l6-12z" fill={color}/><path d="M25 44h5l3 5 3-5h5v3h-4l-4 5-4-5h-4z" fill={accent}/><rect x="24" y="54" width="18" height="2" fill="#f4b7c9"/><path d="M25 58h2v7h-2zM32 58h2v7h-2zM39 58h2v7h-2z" fill="#e797b5"/></> : <><path d="M24 43h7l2 5 2-5h7v17H24z" fill={color}/><path d="M28 43h3l2 5 2-5h3l-5 10z" fill={accent}/><path d="M31 48h4l-1 9h-2z" fill="#b45309"/><rect x="38" y="52" width="4" height="2" fill={accent}/><rect x="32" y="58" width="2" height="2" fill={accent}/></>; break;
    case 'hat': art = female ? <><path d="M23 15h20v7H23zM25 12h16v3H25zM19 21h28v2H19z" fill={color}/><path d="M28 13h4v2h2v-2h4v6h-4v-2h-2v2h-4z" fill={accent}/><rect x="32" y="15" width="2" height="2" fill="#fbbf24"/></> : <><path d="M21 16h25v5H21zM24 12h19v4H24zM28 10h12v2H28z" fill={color}/><rect x="25" y="21" width="18" height="2" fill="#172554"/><rect x="36" y="15" width="4" height="3" fill={accent}/></>; break;
    case 'hair': art = female ? <><path d="M22 18h22v6H22zM22 23h5v5h-3v18h-4V25h2zM39 23h5v25h-4V28h-1zM42 18h7v6h-3v15h-4z" fill={color}/><rect x="43" y="22" width="4" height="2" fill="#be527c"/></> : <><path d="M22 19h22v5H22zM24 16h18v3H24zM25 14h14v2H25zM22 23h3v7h-3zM41 23h3v7h-3z" fill={color}/><rect x="25" y="19" width="12" height="2" fill="#795548"/></>; break;
    case 'shoes': art = female ? <><path d="M21 70h11v3H21zM34 70h12v3H34z" fill={color}/><path d="M25 69h4v2h-4zM38 69h4v2h-4z" fill={accent}/></> : <><path d="M21 68h11v5H21zM34 68h12v5H34z" fill={color}/><path d="M23 69h7v1h-7zM36 69h8v1h-8z" fill={accent}/><path d="M21 73h11v1H21zM34 73h12v1H34z" fill="#172554"/></>; break;
    case 'face': art = female ? <><path d="M25 27h3v1h-3zM38 27h3v1h-3z" fill="#49382c"/><path d="M24 33h3v1h-3zM39 33h3v1h-3z" fill="#d88b87"/></> : <><path d="M24 27h8v1h-8zM24 28h1v4h-1zM31 28h1v4h-1zM24 32h8v1h-8zM34 27h8v1h-8zM34 28h1v4h-1zM41 28h1v4h-1zM34 32h8v1h-8zM32 28h2v1h-2z" fill={color}/></>; break;
    case 'expression': art = <g fill={female ? '#e797b5' : '#315c85'}><rect x="24" y="32" width="3" height="1"/><rect x="39" y="32" width="3" height="1"/></g>; break;
    case 'backpack': art = female ? <><path d="M14 44h9v16h-9zM16 41h5v3h-5z" fill={color}/><rect x="15" y="51" width="7" height="6" fill="#e797b5"/><rect x="18" y="53" width="2" height="2" fill={accent}/></> : <><path d="M11 49h14v11H11zM14 43h3v6h-3z" fill={color}/><rect x="12" y="50" width="12" height="3" fill="#172554"/><rect x="17" y="53" width="3" height="2" fill={accent}/></>; break;
  }
  return <g data-collection-detail={item.id} data-clothing-gender={item.gender}>{art}</g>;
}
