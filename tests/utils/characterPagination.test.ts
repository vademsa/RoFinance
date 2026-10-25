import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETICS } from '../../shared/character';
import { paginateCharacterItems } from '../../src/utils/characterPagination';

test('pagination covers every item exactly once and clamps stale pages after filters or inventory changes', () => {
  const items = COSMETICS.filter((item) => !item.secret);
  const seen = [];
  const first = paginateCharacterItems(items, 1);
  for (let page = 1; page <= first.totalPages; page++) {
    const slice = paginateCharacterItems(items, page);
    assert.ok(slice.items.length <= 6);
    seen.push(...slice.items);
  }
  assert.deepEqual(seen, items);
  assert.equal(paginateCharacterItems(items.slice(0, 2), 100).page, 1);
  assert.equal(paginateCharacterItems(items, -1).page, 1);
  assert.equal(paginateCharacterItems(items, NaN).page, 1);
  assert.deepEqual(paginateCharacterItems([], 7), { items: [], page: 1, totalPages: 1, total: 0, first: 0, last: 0 });
  assert.throws(() => paginateCharacterItems(items, 1, 0));
});
