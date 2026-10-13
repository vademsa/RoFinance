import React from 'react';
import icon from '../assets/brand/rofinance-icon.png';
import wordmark from '../assets/brand/rofinance-wordmark.png';

/** Shared web/native branding; Vite fingerprints the assets for cache-safe releases. */
export function BrandLogo({ variant = 'icon', className = '', decorative = false }: {
  variant?: 'icon' | 'wordmark'; className?: string; decorative?: boolean;
}) {
  return <img src={variant === 'wordmark' ? wordmark : icon} alt={decorative ? '' : 'RoFinance'}
    aria-hidden={decorative || undefined} data-brand-logo={variant}
    width={variant === 'wordmark' ? 816 : 256} height={variant === 'wordmark' ? 222 : 256}
    className={`object-contain ${className}`} draggable={false}/>;
}
