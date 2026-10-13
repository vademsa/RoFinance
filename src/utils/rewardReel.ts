import { COSMETICS, type Cosmetic, type DrawResult } from '../../shared/character';

export const REEL_CARD_WIDTH = 112;
export const REEL_CARD_GAP = 10;
export const REEL_SPIN_MS = 10000;
export const REEL_START_INDEX = 2;
// 48 card intervals instead of 30: 60% faster travel over the same ten seconds.
export const REEL_LANDING_INDEX = 50;
export const reelOffset = (index: number) => -(index * (REEL_CARD_WIDTH + REEL_CARD_GAP) + REEL_CARD_WIDTH / 2);

/** Presentation clock only; background suspension must not extend a draw. */
export const reelElapsed = (startedAt: number, now: number = Date.now()) => Math.max(0, Math.min(REEL_SPIN_MS, now - startedAt));

/** Smooth acceleration to the midpoint, then braking to zero; no velocity jumps. */
export function reelPosition(elapsedMs: number): number {
  const time = Math.max(0, Math.min(1, elapsedMs / REEL_SPIN_MS));
  // Quintic smootherstep: speed and acceleration both start/end at zero.
  // Peak speed is at half-time; clamp rounding at the exact landing bounds.
  const distance = Math.max(0, Math.min(1, time ** 3 * (time * (6 * time - 15) + 10)));
  return REEL_START_INDEX + (REEL_LANDING_INDEX - REEL_START_INDEX) * distance;
}

/** Decorative sequence only, not a probability pool. The landing card is always the server outcome. */
export function buildRewardReel(outcome: DrawResult | null, random: () => number = Math.random): Array<Cosmetic | null> {
  const visible = COSMETICS.filter((item) => !item.starter && !item.secret);
  const shuffle = <T,>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  shuffle(visible);
  // Keep enough cards beyond the landing point for wide screens.
  const cards = shuffle(Array.from({ length: REEL_LANDING_INDEX + 6 }, (_, index) => index % 5 === 0 ? null : visible[index]));
  if (outcome) cards[REEL_LANDING_INDEX] = outcome.itemId === null ? null : COSMETICS.find((item) => item.id === outcome.itemId) ?? null;
  return cards;
}
