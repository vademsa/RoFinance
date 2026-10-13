import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDashed } from 'lucide-react';
import { COSMETICS } from '../../../shared/character';
import type { CharacterProfile, DrawResult } from '../../../shared/character';
import { buildRewardReel, REEL_LANDING_INDEX, REEL_START_INDEX, REEL_SPIN_MS, reelElapsed, reelOffset, reelPosition } from '../../utils/rewardReel';
import { CosmeticArtwork } from './CosmeticArtwork';
import type { CharacterLanguage } from './characterText';

export function RewardReel({ language, ready, opening, confirmed, result, startedAt, onSettled }: {
  profile: CharacterProfile; language: CharacterLanguage; ready: boolean; opening: boolean; confirmed: DrawResult | null; result: DrawResult | null;
  startedAt: number | null; onSettled: (outcome: DrawResult) => void;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const target = result || confirmed;
  // One decorative strip per mounted run. Confirmation only replaces the
  // offscreen landing card; never reshuffle the already visible neighbours.
  const [sequence] = useState(() => buildRewardReel(null));
  const cards = useMemo(() => {
    const next = [...sequence];
    if (target) next[REEL_LANDING_INDEX] = COSMETICS.find((item) => item.id === target.itemId) ?? null;
    return next;
  }, [sequence, target]);
  const [settling, setSettling] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSettling(false);
    if (!opening || !ready || !track.current || startedAt === null) return;
    const element = track.current;
    const itemCards = Array.from(element.children) as HTMLElement[];
    let frame = 0;
    let selectedIndex = -1;
    let settled = false;
    setSettling(true);
    const paint = () => {
      if (settled) return true;
      const elapsed = reelElapsed(startedAt);
      // Await the server rather than landing on a decorative, unconfirmed item.
      const position = Math.min(reelPosition(elapsed), target ? REEL_LANDING_INDEX : REEL_LANDING_INDEX - 3);
      element.style.transform = `translateX(${reelOffset(position)}px)`;
      const index = Math.round(position);
      if (index !== selectedIndex) {
        itemCards[selectedIndex]?.removeAttribute('data-active');
        itemCards[index]?.setAttribute('data-active', 'true'); selectedIndex = index;
      }
      if (elapsed >= REEL_SPIN_MS && target) { settled = true; onSettled(target); return true; }
      return false;
    };
    const tick = () => { frame = 0; if (!paint()) frame = requestAnimationFrame(tick); };
    const reconcile = () => { if (paint()) cancelAnimationFrame(frame); };
    // RAF provides foreground motion; the independent deadline and resume
    // events reconcile even when RAF is throttled. A suspended OS cannot paint,
    // but returning after ten seconds immediately shows the confirmed result.
    const deadline = window.setTimeout(reconcile, Math.max(0, startedAt + REEL_SPIN_MS - Date.now()));
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('focus', reconcile);
    window.addEventListener('pageshow', reconcile);
    if (!paint()) frame = requestAnimationFrame(tick);
    return () => {
      const completed = settled;
      settled = true; cancelAnimationFrame(frame); window.clearTimeout(deadline);
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('pageshow', reconcile);
      // React now owns the terminal marker. Do not erase it during effect
      // cleanup immediately after onSettled renders the result.
      if (!completed) itemCards[selectedIndex]?.removeAttribute('data-active');
    };
  }, [target, ready, opening, startedAt, onSettled]);
  const landed = Boolean(target) && !opening;
  return <div className="reward-stage reward-reel-stage" data-motion="full" data-phase={opening ? 'opening' : result ? 'revealed' : 'ready'}>
    <div className="reward-reel-viewport" aria-hidden="true">
      <div ref={track} className="reward-reel-track"
        data-settling={Boolean(opening && settling)} data-duration-ms={REEL_SPIN_MS}
        style={{ transform: `translateX(${reelOffset(landed ? REEL_LANDING_INDEX : REEL_START_INDEX)}px)` }}>
        {cards.map((item, index) => <div key={index} className="reward-reel-card" data-item-id={item?.id ?? 'none'} data-rarity={item?.rarity ?? 'none'}
          data-landing={index === REEL_LANDING_INDEX} data-active={landed && index === REEL_LANDING_INDEX ? 'true' : undefined}>
          {item ? <CosmeticArtwork item={item} size={80} effects={false} title={language === 'en' ? item.en : item.vi}/>
            : <CircleDashed size={44} strokeWidth={1.5}/>}
          <span>{item ? language === 'en' ? item.en : item.vi : t('Không trúng', 'No item')}</span>
        </div>)}
      </div>
      <div className="reward-reel-marker"><span/></div>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{opening ? target ? t('Đang quay…', 'Spinning…') : t('Đang xác nhận lượt quay…', 'Confirming the draw…')
      : result ? result.itemId === null ? t('Không trúng vật phẩm trong lượt này', 'No item won on this draw') : t('Vật phẩm tại vạch chọn đã được xác nhận', 'The item at the marker is confirmed')
        : t('Vật phẩm dừng tại vạch giữa là kết quả của bạn', 'The card stopped at the centre marker is your result')}</p>
  </div>;
}
