import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMON_COIN_ICON_IDS, getCoinIconUrl } from './coinIcons';

test('CAKE and GRASS have immediately available CoinMarketCap icons', () => {
  assert.equal(getCoinIconUrl(COMMON_COIN_ICON_IDS.CAKE),
    'https://s2.coinmarketcap.com/static/img/coins/64x64/7186.png');
  assert.equal(getCoinIconUrl(COMMON_COIN_ICON_IDS.GRASS),
    'https://s2.coinmarketcap.com/static/img/coins/64x64/32956.png');
});

test('invalid icon IDs do not create an external image URL', () => {
  assert.equal(getCoinIconUrl(undefined), null);
  assert.equal(getCoinIconUrl(-1), null);
  assert.equal(getCoinIconUrl(1.5), null);
});
