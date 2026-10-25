import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETICS } from '../../shared/character';
import { buildRewardReel, REEL_LANDING_INDEX, REEL_START_INDEX, REEL_SPIN_MS, REEL_CARD_WIDTH, REEL_CARD_GAP, reelElapsed, reelOffset, reelPosition } from '../../src/utils/rewardReel';

test('the faster reel starts slowly, accelerates then brakes smoothly to its exact landing, with a ten-second minimum', () => {
  assert.ok(REEL_SPIN_MS >= 10000);
  assert.equal(REEL_LANDING_INDEX - REEL_START_INDEX, 48, 'travels 60% farther than the previous 30-card strip in the same time');
  assert.equal(reelPosition(-1), REEL_START_INDEX);
  assert.equal(reelPosition(REEL_SPIN_MS), REEL_LANDING_INDEX);
  assert.equal(reelPosition(REEL_SPIN_MS + 1), REEL_LANDING_INDEX);
  const crossed = new Set<number>();
  let previous = REEL_START_INDEX;
  for (let elapsed = 0; elapsed <= REEL_SPIN_MS; elapsed += 10) {
    const index = reelPosition(elapsed);
    assert.ok(index >= previous && index <= REEL_LANDING_INDEX);
    crossed.add(Math.round(index)); previous = index;
  }
  assert.equal(crossed.size, REEL_LANDING_INDEX - REEL_START_INDEX + 1);
  const travel = Array.from({ length: 10 }, (_, second) => reelPosition((second + 1) * 1000) - reelPosition(second * 1000));
  for (let i = 1; i < 5; i++) assert.ok(travel[i] > travel[i - 1], 'each initial second accelerates');
  for (let i = 6; i < 10; i++) assert.ok(travel[i] < travel[i - 1], 'each final second decelerates');
  assert.ok(Math.abs(travel[4] - travel[5]) < 1e-10, 'no abrupt speed change at halfway');
  assert.ok(travel[4] > travel[0] * 10, 'acceleration is visually noticeable');
  assert.ok(reelPosition(10) - REEL_START_INDEX < 1e-6, 'starts at rest');
  assert.ok(REEL_LANDING_INDEX - reelPosition(REEL_SPIN_MS - 10) < 1e-6, 'comes to rest');
  // Normal 100ms foreground samples still traverse consecutive cards. Hidden
  // or suspended frames intentionally catch up using elapsed real time.
  for (let elapsed = 100; elapsed <= REEL_SPIN_MS; elapsed += 100) {
    assert.ok(reelPosition(elapsed) - reelPosition(elapsed - 100) < 1);
  }
});

test('reel time uses the original run start, including suspended frames and late server confirmation', () => {
  const start = 50000;
  assert.equal(reelElapsed(start, start - 100), 0);
  assert.equal(reelElapsed(start, start + 3000), 3000);
  assert.equal(reelElapsed(start, start + 9999), 9999);
  assert.equal(reelElapsed(start, start + 10000), REEL_SPIN_MS);
  assert.equal(reelElapsed(start, start + 60000), REEL_SPIN_MS);
  assert.equal(reelPosition(reelElapsed(start, start + 60000)), REEL_LANDING_INDEX);
});

test('the centre marker always matches the confirmed winning item or empty result, never a client-picked prize', () => {
  for (const itemId of [null, ...COSMETICS.filter((item) => !item.starter).map((item) => item.id)]) {
    const cards = buildRewardReel({ itemId, duplicate: false, fragments: 0, guaranteed: false });
    assert.equal(cards.length, REEL_LANDING_INDEX + 6, 'wide screens have decorative cards after the actual landing');
    assert.equal(cards[REEL_LANDING_INDEX]?.id ?? null, itemId);
    assert.equal(reelOffset(REEL_LANDING_INDEX) + REEL_LANDING_INDEX * (REEL_CARD_WIDTH + REEL_CARD_GAP) + REEL_CARD_WIDTH / 2, 0);
    assert.ok(cards.every((item, index) => index === REEL_LANDING_INDEX || !item?.secret));
  }
  assert.ok(buildRewardReel(null).every((item) => !item?.secret));
});

test('decorative cards showcase different public prizes rather than repeating a seven-item sub-pool', () => {
  const shown = buildRewardReel(null).flatMap((item) => item ? [item.id] : []);
  assert.equal(new Set(shown).size, shown.length);
});

test('each draw shuffles its decorative neighbours, without changing the confirmed outcome or showing secret decoys', () => {
  const neighbours = new Set<string>();
  for (let seed = 1; seed <= 32; seed++) {
    let state = seed;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const result = { itemId: 'hat-comet', duplicate: false, fragments: 0, guaranteed: false };
    const cards = buildRewardReel(result, random);
    assert.equal(cards[REEL_LANDING_INDEX]?.id, result.itemId);
    neighbours.add(cards[REEL_LANDING_INDEX - 1]?.id ?? 'none');
    assert.ok(cards.every((item, index) => index === REEL_LANDING_INDEX || !item?.secret));
  }
  assert.ok(neighbours.size > 10, 'the card before the prize must not always be Starlight face');
});
