import assert from 'node:assert/strict';
import test from 'node:test';
import { getDynamicAmountSuggestions } from './amountSuggestions';

test('typing 2 suggests 200, 2 thousand, 20 thousand and 200 thousand', () => {
  assert.deepEqual(getDynamicAmountSuggestions(2), [200, 2_000, 20_000, 200_000]);
});

test('each trailing zero increases every suggestion by ten', () => {
  assert.deepEqual(getDynamicAmountSuggestions(20), [2_000, 20_000, 200_000, 2_000_000]);
  assert.deepEqual(getDynamicAmountSuggestions(200), [20_000, 200_000, 2_000_000, 20_000_000]);
  assert.deepEqual(getDynamicAmountSuggestions(25), [2_500, 25_000, 250_000, 2_500_000]);
});

test('no amount produces no hard-coded suggestions', () => {
  assert.deepEqual(getDynamicAmountSuggestions(0), []);
  for (const value of [NaN, Infinity, -2, 0.2, Number.MAX_SAFE_INTEGER]) assert.deepEqual(getDynamicAmountSuggestions(value), []);
  assert.deepEqual(getDynamicAmountSuggestions(10_000_000_000_000), [1_000_000_000_000_000]);
});
