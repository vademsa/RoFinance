import { useEffect, useState } from 'react';
import { getCoinIconUrl } from '../utils/coinIcons';

interface CoinIconProps {
  symbol: string;
  coinMarketCapId?: number;
  size?: 'xs' | 'sm' | 'md';
}

export function CoinIcon({ symbol, coinMarketCapId, size = 'md' }: CoinIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [coinMarketCapId]);
  const iconUrl = getCoinIconUrl(coinMarketCapId);
  const sizeClass = size === 'xs' ? 'h-5 w-5 text-[7px]' :
    size === 'sm' ? 'h-7 w-7 text-[9px]' : 'h-9 w-9 text-[10px]';

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/20 bg-amber-500/10 font-black text-amber-400 ${sizeClass}`}
      aria-hidden="true" data-no-translate="true">
      <span>{symbol.slice(0, 5)}</span>
      {iconUrl && !imageFailed && (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full bg-white object-contain"
        />
      )}
    </span>
  );
}
