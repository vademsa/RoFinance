import React from 'react';
import type { OutfitSet } from '../../utils/outfitSets';
import { SignatureLogo } from './SignatureDetails';

/** Decorative SVG behind the portrait, never an award or an ownership flag. */
export function FullSetEffect({ set }: { set: OutfitSet }) {
  const { motif } = set;
  const particles = [[7, 17], [53, 22], [4, 39], [56, 43], [9, 61], [49, 67], [22, 8], [43, 10]];
  return <svg className="full-set-effect" data-outfit-set={set.id} data-set-motif={motif} viewBox="0 0 64 80"
    aria-hidden="true" focusable="false" style={{ '--set-main': set.main, '--set-light': set.light } as React.CSSProperties}>
    <ellipse className="full-set-halo" cx="32" cy="40" rx="28" ry="35"/>
    <g className="full-set-emblem" fill="none" stroke="var(--set-main)" strokeWidth="1">
      {motif === 'signature' && <><path d="M32 3L59 20V59L32 77L5 59V20Z M32 8L55 23V57L32 72L9 57V23Z" strokeWidth="1.6"/><path d="M8 21l8 4M56 21l-8 4M8 58l8-4M56 58l-8-4" stroke="var(--set-light)" strokeWidth="2"/><g stroke="none"><SignatureLogo x={27} y={4} scale={1.8}/></g></>}
      {motif === 'constellation' && <><ellipse cx="32" cy="40" rx="27" ry="33"/><path d="M7 17L22 8L43 10L53 22L56 43L49 67L9 61L4 39Z M7 17L4 39L22 8 M43 10L56 43L53 22 M9 61L49 67"/></>}
      {motif === 'phoenix' && <g fill="var(--set-main)" stroke="var(--set-light)" strokeWidth=".5"><path d="M30 32l-8-8-6-3-7-12 1 17 5 10 11 10-9 16 14-8 1 15 3-15 12 8-8-16 11-10 5-10 1-17-7 12-6 3-8 8-3-6z"/><path d="M23 4h18l-3 5-6-2-6 2z"/></g>}
      {motif === 'sigil' && <><path d="M32 5L59 24V55L32 74L5 55V24Z M32 10L54 26V53L32 69L10 53V26Z"/><path d="M22 12l2-6 8 6 8-6 2 6z" fill="var(--set-light)"/></>}
      {motif === 'electric' && <><path d="M14 8L5 24H12L4 43 M50 8L59 24H52L60 43 M6 52L14 59H8L19 71 M58 52L50 59H56L45 71" strokeWidth="1.8"/><path d="M23 6h18M23 74h18"/></>}
      {motif === 'waves' && <><path d="M3 62q8-8 15 0t15 0t15 0t13 0 M3 69q8-8 15 0t15 0t15 0t13 0" strokeWidth="1.5"/><path d="M6 17q5-8 10 0M48 17q5-8 10 0"/></>}
      {motif === 'grid' && <><path d="M5 18h12M5 18v12 M47 18h12v12 M5 52v12h12 M47 64h12V52 M5 35h8M51 35h8 M5 44h8M51 44h8"/><path d="M20 6h24M20 73h24" strokeDasharray="2 3"/></>}
      {motif === 'sun' && <><ellipse cx="32" cy="37" rx="25" ry="30"/><path d="M32 1v5 M7 9l4 4 M2 35h5 M57 35h5 M53 13l4-4 M12 66l-4 4 M52 66l4 4 M32 71v6" strokeWidth="2"/></>}
      {(motif === 'leaves' || motif === 'petals') && <><path d="M17 69Q1 46 11 23 M47 69Q63 46 53 23"/><path d="M6 38l-3-8 8 2z M9 53l-5-8 8 2z M58 38l3-8-8 2z M55 53l5-8-8 2z" fill="var(--set-main)"/></>}
      {(motif === 'stars' || motif === 'snow') && <><ellipse cx="32" cy="40" rx="26" ry="34" strokeDasharray={motif === 'snow' ? '2 5' : '1 4'}/><path d="M21 5l3 3h16l3-3 M20 73h24" stroke="var(--set-light)"/></>}
    </g>
    {particles.map(([x, y], index) => <g className="full-set-particle" key={index} transform={`translate(${x} ${y})`}>
      <g className="full-set-particle-motion" style={{ '--particle-delay': `${-index * .7}s` } as React.CSSProperties}>
        {motif === 'leaves' ? <path d="M-2-2h4v2H0v2h-2z" fill="var(--set-main)"/>
          : motif === 'petals' ? <path d="M-2-1h2v-2h2v2h1v2H1v1h-3z" fill="var(--set-main)"/>
          : motif === 'phoenix' ? <path d="M0-4l2 3v3h-4v-3z" fill="var(--set-light)"/>
          : motif === 'snow' ? <path d="M-2 0h4M0-2v4M-1-1l2 2M1-1l-2 2" stroke="var(--set-main)" strokeWidth=".8"/>
          : <path d="M0-3v6M-3 0h6" stroke="var(--set-light)" strokeWidth="1.2"/>}
      </g>
    </g>)}
  </svg>;
}
