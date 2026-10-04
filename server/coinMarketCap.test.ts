import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoinMarketCapLookup, parseCoinIconSymbols } from './coinMarketCap';

test('coin icon symbols accept only bounded ticker lists', () => {
  assert.deepEqual(parseCoinIconSymbols(' btc,ETH,btc '), ['BTC', 'ETH']);
  assert.equal(parseCoinIconSymbols('BTC,<script>'), null);
  assert.equal(parseCoinIconSymbols('BTC/'.repeat(300)), null);
  assert.equal(parseCoinIconSymbols(Array(51).fill(0).map((_, index) => `C${index}`).join(',')), null);
});

test('coin icons use the highest-ranked ID for an ambiguous symbol', async () => {
  let calls = 0;
  const lookup = createCoinMarketCapLookup(async () => {
    calls += 1;
    return [
      { id: 900, symbol: 'ABC', rank: 80 },
      { id: 901, symbol: 'ABC', rank: 12 },
      { id: 1, symbol: 'BTC', rank: 1 },
    ];
  });
  assert.deepEqual(await lookup(['ABC', 'BTC']), { ABC: 901, BTC: 1 });
  assert.deepEqual(await lookup(['BTC']), { BTC: 1 });
  assert.equal(calls, 1);
});

test('coin icon lookup checks later pages for less popular coins', async () => {
  const starts: number[] = [];
  const lookup = createCoinMarketCapLookup(async (start) => {
    starts.push(start);
    if (start !== 1) return [{ id: 6001, symbol: 'RARE', rank: 6001 }];
    const firstPage: unknown[] = Array.from({ length: 5000 }, (_, index) =>
      ({ id: index + 1, symbol: `TOP${index}`, rank: index + 1 }));
    firstPage[0] = null; // An invalid entry must not make a full page look incomplete.
    return firstPage;
  });
  assert.deepEqual(await lookup(['RARE', 'MISSING']), { RARE: 6001 });
  assert.deepEqual(starts, [1, 5001]);
});
