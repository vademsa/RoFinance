import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCustomCategories } from './categoryValidation';

test('normalizes a valid custom category', () => {
  const result = validateCustomCategories([{
    id: 'custom-123',
    name: '  Ăn   khuya ',
    type: 'expense',
    icon: 'utensils',
    jarCode: 'NEC',
    isCustom: false,
    createdAt: '2026-08-27T12:00:00.000Z',
  }]);
  assert.equal(result.value?.[0].name, 'Ăn khuya');
  assert.equal(result.value?.[0].isCustom, true);
});

test('rejects duplicate names without accents in the same scope', () => {
  const result = validateCustomCategories([
    { id: 'one', name: 'Cà phê', type: 'expense', icon: 'coffee', jarCode: 'NEC' },
    { id: 'two', name: 'ca phe', type: 'expense', icon: 'coffee', jarCode: 'NEC' },
  ]);
  assert.match(result.error || '', /bị trùng/);
});

test('allows the same name in different jars and rejects unknown icons', () => {
  assert.ok(validateCustomCategories([
    { id: 'one', name: 'Riêng', type: 'expense', icon: 'tag', jarCode: 'NEC' },
    { id: 'two', name: 'Riêng', type: 'expense', icon: 'tag', jarCode: 'PLAY' },
  ]).value);
  assert.match(validateCustomCategories([
    { id: 'one', name: 'Riêng', type: 'income', icon: '<svg>' },
  ]).error || '', /Icon/);
});

test('rejects duplicate category ids', () => {
  const result = validateCustomCategories([
    { id: 'same', name: 'Một', type: 'income', icon: 'tag' },
    { id: 'same', name: 'Hai', type: 'income', icon: 'tag' },
  ]);
  assert.match(result.error || '', /Mã danh mục bị trùng/);
});
