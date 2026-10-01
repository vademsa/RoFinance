import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE,
  DEFAULT_INCOME_CATEGORIES,
  getTransactionCategories,
} from '../constants/categories';

test('default category ids are unique and the catalog is comprehensive', () => {
  const expenses = Object.values(DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE).flat();
  const all = [...expenses, ...DEFAULT_INCOME_CATEGORIES];
  assert.equal(new Set(all.map((category) => category.id)).size, all.length);
  assert.ok(all.length >= 70);
  const essentialNames = DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE.NEC.map((category) => category.name);
  ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Cafe & Đồ uống', 'Đi chợ & Siêu thị']
    .forEach((name) => assert.ok(essentialNames.includes(name)));
});

test('custom expense categories are scoped to their jar', () => {
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
  assert.ok(!getTransactionCategories('expense', 'PLAY', custom).some((item) => item.name === 'Ăn khuya'));
});
