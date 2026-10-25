import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryChartView, defaultCategoryChartView, getChartCategoryTransactions } from '../../src/utils/categoryChartView';
import { parseChartGroupRequest, parseChartGroupSuggestions } from '../../shared/categoryChartGroups';
import type { Transaction } from '../../src/types';

const categories = [{ name: 'Ăn sáng', amount: 100, count: 1, isCustom: true },
  { name: 'Cafe', amount: 200, count: 2, isCustom: true }, { name: 'Xăng', amount: 300, count: 3 }];

test('chart views select and aggregate without changing original categories, amounts or counts', () => {
  const original = structuredClone(categories);
  const view = { selectedNames: ['Ăn sáng', 'Cafe'], groups: [{ name: 'Food', members: ['Ăn sáng', 'Cafe'] }] };
  assert.deepEqual(buildCategoryChartView(categories, view), [{ name: 'Food', amount: 300, count: 3, isCustom: true, sourceNames: ['Ăn sáng', 'Cafe'] }]);
  assert.deepEqual(categories, original);
  assert.deepEqual(view.selectedNames, ['Ăn sáng', 'Cafe']);
  assert.equal(buildCategoryChartView(categories, defaultCategoryChartView()).reduce((sum, row) => sum + row.amount, 0), 600);
  assert.deepEqual(buildCategoryChartView(categories, { selectedNames: [], groups: [] }), []);
});

test('overlapping, stale and colliding chart groups cannot duplicate or lose selected categories', () => {
  const rows = buildCategoryChartView(categories, { selectedNames: null, groups: [
    { name: 'Cafe', members: ['Ăn sáng', 'Xăng'] }, // collision => ignored
    { name: 'Food', members: ['Ăn sáng', 'Cafe', 'Cafe'] },
    { name: 'Overlap', members: ['Cafe', 'Xăng'] }, // only one available => ignored
    { name: 'Deleted', members: ['Gone', 'Absent'] },
  ] });
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 600);
  assert.deepEqual(rows.flatMap(row => row.sourceNames).sort(), categories.map(row => row.name).sort());
  assert.equal(rows.find(row => row.name === 'Food')?.count, 3);
  const filtered = buildCategoryChartView(categories, { selectedNames: ['Cafe'], groups: [{ name: 'Food', members: ['Ăn sáng', 'Cafe'] }] });
  assert.deepEqual(filtered.map(row => row.name), ['Cafe']);
});

test('group drilldown retains original category, type, account, order and transaction identity', () => {
  const base: Transaction = { id: 'a', type: 'expense', amount: 100, category: 'Ăn sáng', jarId: '', bankAccountId: 'bank', date: '2026-10-01', description: 'Synthetic' };
  const transactions: Transaction[] = [base, { ...base, id: 'b', category: 'Cafe', date: '2026-10-03' },
    { ...base, id: 'income', type: 'income' }, { ...base, id: 'transfer', type: 'transfer' },
    { ...base, id: 'other', category: 'Xăng' }, { ...base, id: 'nan', amount: NaN }, { ...base, id: 'negative', amount: -1 }];
  const snapshot = structuredClone(transactions);
  const rows = getChartCategoryTransactions(transactions, 'expense', ['Ăn sáng', 'Cafe', 'Cafe']);
  assert.deepEqual(rows.map(row => row.id), ['b', 'a']);
  assert.equal(rows[0], transactions[1]); assert.equal(rows[0].bankAccountId, 'bank');
  assert.deepEqual(transactions, snapshot);
});

const catalog = [{ id: 'c0', label: 'Ăn sáng' }, { id: 'c1', label: 'Cafe' }, { id: 'c2', label: 'Xăng' }];
const request = { type: 'expense', language: 'vi', categories: catalog };
test('AI accepts only bounded category labels and IDs, not financial data or arbitrary enums', () => {
  assert.deepEqual(parseChartGroupRequest(request), request);
  for (const value of [null, [], { ...request, type: ['expense'] }, { ...request, language: ['vi'] },
    { ...request, type: 'transfer' }, { ...request, language: 'fr' }, { ...request, amount: 100 },
    { ...request, categories: catalog.map(row => ({ ...row, amount: 10 })) },
    { ...request, categories: [catalog[0]] }, { ...request, categories: [catalog[0], catalog[0]] },
    { ...request, categories: [{ id: 'private-transaction-id', label: 'X' }, catalog[1]] },
    { ...request, categories: [{ id: 'c0', label: 'X'.repeat(121) }, catalog[1]] },
    { ...request, categories: [{ id: 'c0', label: 'secret\nvalue' }, catalog[1]] },
    { ...request, categories: Array.from({ length: 201 }, (_, i) => ({ id: `c${i}`, label: `N${i}` })) },
  ]) assert.equal(parseChartGroupRequest(value), null);
});

test('AI groups reject invented IDs, overlaps, duplicate/colliding labels and malformed structures', () => {
  const group = { name: 'Ăn uống', memberIds: ['c0', 'c1'] };
  assert.deepEqual(parseChartGroupSuggestions({ groups: [group] }, catalog), [group]);
  assert.deepEqual(parseChartGroupSuggestions({ groups: [] }, catalog), []);
  for (const value of [null, [], { groups: 'x' }, { groups: [group], amount: 100 },
    { groups: [{ ...group, memberIds: ['c0', 'c99'] }] }, { groups: [{ ...group, memberIds: ['c0', 'c0'] }] },
    { groups: [{ ...group, memberIds: ['c0'] }] }, { groups: [{ ...group, name: ' CAFE ' }] },
    { groups: [{ ...group, name: 'A'.repeat(71) }] }, { groups: [{ ...group, name: 'Food\nInjected' }] },
    { groups: [group, { name: 'Other', memberIds: ['c1', 'c2'] }] },
    { groups: [{ ...group, amount: 999 }] },
  ]) assert.equal(parseChartGroupSuggestions(value, catalog), null);
});
