import React from 'react';
import type { Cosmetic } from '../../../shared/character';
import { SignatureDetails } from './SignatureDetails';
import { GenderedCostumeDetails } from './GenderedCostumeDetails';

// Code-native pixel layers: collections alter silhouettes and motifs, not just
// swatch colours. Face/expression accessories never replace the mood's mouth.
export function CostumeDetails({ item }: { item?: Cosmetic }) {
  if (!item || item.variant < 5) return null;
  if (item.gender === 'male' || item.gender === 'female') return <GenderedCostumeDetails item={item}/>;
  if (item.exclusive && item.id === `${item.slot}-rofinance`) return <SignatureDetails item={item}/>;
  const { slot, variant: v, color } = item;
  const accent = v >= 12 ? '#fde68a' : v === 9 ? '#cffafe' : '#f8fafc';
  const motif = v % 5;
  let content: React.ReactNode;
  switch (slot) {
    case 'shirt': content = <>
      {v === 5 ? <><rect x="25" y="48" width="5" height="5" fill={accent}/><rect x="36" y="48" width="5" height="5" fill={accent}/><rect x="32" y="44" width="1" height="15" fill="#93c5fd"/></>
        : v === 8 ? <><rect x="23" y="49" width="20" height="2" fill={accent}/><rect x="23" y="54" width="20" height="2" fill={accent}/><path d="M25 43h5v3h6v-3h5v4H25z" fill="#1e3a8a"/></>
        : v === 11 ? <><rect x="23" y="43" width="6" height="3" fill={accent}/><rect x="37" y="43" width="6" height="3" fill={accent}/><rect x="18" y="52" width="5" height="3" fill={accent}/><rect x="43" y="52" width="5" height="3" fill={accent}/><rect x="32" y="45" width="2" height="14" fill={accent}/></>
        : v === 14 ? <path d="M24 46h3v3h3v3h3v-5h2v5h3v-3h3v-3h2v6h-5v3h-8v-3h-6z" fill={accent}/>
        : v === 18 ? <><rect x="26" y="46" width="14" height="12" fill="#fbbf24"/><rect x="29" y="44" width="12" height="12" fill="#0f172a"/><rect x="32" y="57" width="3" height="2" fill="#e0e7ff"/></>
        : <><rect x="25" y={46 + motif} width="3" height="10" fill={accent}/><rect x="32" y="48" width="2" height="7" fill={accent}/><rect x="29" y={50 + motif % 2} width="8" height="2" fill={accent}/><rect x="39" y="46" width="3" height={7 + motif} fill={accent}/></>}
    </>; break;
    case 'hat': content = <>
      <rect x={20 + motif} y={9 - motif} width={22 - motif * 2} height={5 + motif} fill={color}/>
      {v >= 12 ? <><rect x="23" y="8" width="3" height="8" fill={accent}/><rect x="32" y="5" width="3" height="10" fill={accent}/><rect x="40" y="8" width="3" height="8" fill={accent}/><rect x="30" y="16" width="6" height="2" fill={accent}/></>
        : <><rect x="23" y="18" width="20" height="2" fill={accent}/><rect x={27 + motif} y="11" width="4" height="5" fill={accent}/></>}
      {v === 15 && <><rect x="27" y="7" width="12" height="9" fill="#a78bfa"/><rect x="29" y="9" width="8" height="5" fill="#020617"/><rect x="24" y="11" width="18" height="2" fill="#fbbf24"/></>}
    </>; break;
    case 'hair': content = <>
      <rect x="20" y="23" width="4" height={6 + motif} fill={color}/><rect x="42" y="23" width="4" height={6 + (4 - motif)} fill={color}/>
      <rect x={25 + motif} y="17" width="4" height="6" fill={color}/><rect x="38" y={16 + motif} width="5" height="7" fill={accent}/>
      {v >= 12 && <><rect x="20" y="27" width="2" height="4" fill={accent}/><rect x="45" y="25" width="2" height="3" fill={accent}/></>}
    </>; break;
    case 'shoes': content = <>
      <rect x="22" y={65 - motif % 2} width="9" height="6" fill={color}/><rect x="35" y={65 - motif % 2} width="10" height="6" fill={color}/>
      <rect x="21" y="71" width="11" height="2" fill={accent}/><rect x="34" y="71" width="12" height="2" fill={accent}/>
      <rect x={24 + motif % 3} y="67" width="3" height="2" fill={accent}/><rect x={37 + motif % 3} y="67" width="3" height="2" fill={accent}/>
    </>; break;
    case 'backpack': content = <>
      <rect x="11" y={44 + motif} width="9" height={14 - motif} fill={color}/><rect x="12" y="51" width="6" height="5" fill={accent}/>
      <rect x="14" y="47" width="2" height="3" fill={accent}/>
      {v >= 12 && <><rect x="8" y="45" width="3" height="10" fill={accent}/><rect x="6" y="47" width="2" height="5" fill={color}/></>}
      {v === 16 && <><rect x="9" y="42" width="2" height="4" fill="#fbbf24"/><rect x="7" y="49" width="2" height="3" fill="#fbbf24"/><rect x="10" y="57" width="3" height="4" fill="#fbbf24"/></>}
    </>; break;
    case 'face': content = <>
      <path d={motif % 2 ? 'M24 27h8v5h-8zM34 27h8v5h-8z' : 'M24 27h8v1h-8zM24 28h1v4h-1zM31 28h1v4h-1zM24 32h8v1h-8zM34 27h8v1h-8zM34 28h1v4h-1zM41 28h1v4h-1zM34 32h8v1h-8z'} fill={color}/>
      <rect x="32" y="28" width="2" height="1" fill={color}/><rect x={24 + motif % 2} y="34" width="3" height="1" fill={accent}/>
      {v >= 12 && <rect x="41" y="34" width="2" height="2" fill={accent}/>}
    </>; break;
    case 'expression': content = <>
      <rect x="23" y={31 + motif % 2} width="3" height="2" fill={color}/><rect x="41" y={31 + motif % 2} width="3" height="2" fill={color}/>
      {v >= 12 ? <><rect x="20" y="29" width="2" height="6" fill={accent}/><rect x="18" y="31" width="6" height="2" fill={accent}/><rect x="44" y="26" width="2" height="6" fill={color}/><rect x="42" y="28" width="6" height="2" fill={color}/></>
        : <><rect x="24" y="26" width={2 + motif % 2} height="1" fill={color}/><rect x="40" y="26" width={2 + motif % 2} height="1" fill={color}/></>}
    </>; break;
  }
  return <g data-collection-detail={item.id}>{content}</g>;
}
