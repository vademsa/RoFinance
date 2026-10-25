import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE,
  DEFAULT_INCOME_CATEGORIES,
  getTransactionCategories,
  findTransactionCategory,
} from '../../src/constants/categories';

test('default category ids are unique and the catalog is comprehensive', () => {
  const expenses = Object.values(DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE).flat();
  const all = [...expenses, ...DEFAULT_INCOME_CATEGORIES];
  assert.equal(new Set(all.map((category) => category.id)).size, all.length);
  assert.ok(all.length >= 70);
  const essentialNames = DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE.NEC.map((category) => category.name);
  ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Cafe & Đồ uống', 'Đi chợ & Siêu thị']
    .forEach((name) => assert.ok(essentialNames.includes(name)));
});

test('all default and custom expense categories are shared across every jar and bank-only expenses', () => {
  const custom = [
    {
      id: 'custom-one',
      name: 'Ăn khuya',
      type: 'expense' as const,
      icon: 'utensils' as const,
      jarCode: 'NEC',
      isCustom: true,
    },
  ];
  assert.ok(getTransactionCategories('expense', 'NEC', custom).some((item) => item.name === 'Ăn khuya'));
  const expected = getTransactionCategories('expense', 'NEC', custom);
  for (const code of ['PLAY', 'DEBT', 'MY_CUSTOM_JAR', undefined]) {
    assert.deepEqual(getTransactionCategories('expense', code, custom), expected);
    assert.ok(getTransactionCategories('expense', code, custom).some(item => item.name === 'Ăn khuya'));
    assert.ok(getTransactionCategories('expense', code, custom).some(item => item.name === 'Ăn sáng'));
    assert.ok(getTransactionCategories('expense', code, custom).some(item => item.name === 'Học phí'));
  }
});

test('a custom jar offers the whole expense catalog, including Other, for statement imports', () => {
  const categories = getTransactionCategories('expense', 'MY_CUSTOM_JAR', []);
  assert.ok(categories.length >= 60);
  assert.ok(categories.some(item => item.name === 'Khác'));
  assert.equal(new Set(categories.map(item => item.id)).size, categories.length);
});

test('legacy duplicate names retain distinct IDs/icons and lookup prefers ID while income remains separate', () => {
  const custom = [
    { id: 'custom-one', name: 'Riêng', icon: 'coffee' as const, type: 'expense' as const, jarCode: 'NEC' },
    { id: 'custom-two', name: 'Riêng', icon: 'gift' as const, type: 'expense' as const, jarCode: 'REMOVED_JAR' },
    { id: 'custom-three', name: 'Riêng', icon: 'wallet' as const, type: 'income' as const },
  ];
  const before = structuredClone(custom);
  const expenses = getTransactionCategories('expense', 'PLAY', custom);
  assert.deepEqual(expenses.filter(item => item.name === 'Riêng').map(item => item.id), ['custom-one', 'custom-two']);
  assert.equal(findTransactionCategory('Riêng', 'expense', 'PLAY', custom, 'custom-two')?.icon, 'gift');
  assert.deepEqual(getTransactionCategories('income', 'PLAY', custom).filter(item => item.name === 'Riêng').map(item => item.id), ['custom-three']);
  assert.deepEqual(custom, before);
});
