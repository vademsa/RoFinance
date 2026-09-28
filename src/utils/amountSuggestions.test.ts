import assert from 'node:assert/strict';
import test from 'node:test';
import { getDynamicAmountSuggestions } from './amountSuggestions';

test('typing 3 suggests 30 thousand, 300 thousand and 3 million', () => {
  assert.deepEqual(getDynamicAmountSuggestions(3), [30_000, 300_000, 3_000_000]);
});

test('suggestions adapt to multiple leading digits and ignore trailing zeroes', () => {
  assert.deepEqual(getDynamicAmountSuggestions(25), [25_000, 250_000, 2_500_000]);
  assert.deepEqual(getDynamicAmountSuggestions(300_000), [30_000, 300_000, 3_000_000]);
});

test('no amount produces no hard-coded suggestions', () => {
  assert.deepEqual(getDynamicAmountSuggestions(0), []);
});
