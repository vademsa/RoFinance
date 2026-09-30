import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants/categories';
import { localizeText } from '../components/TranslationLayer';
import { formatShortVND } from './formatters';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../lib/preferences';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionList } from '../components/TransactionList';

test('financial UI phrases translate as complete English sentences', () => {
  assert.equal(localizeText('Danh Sách 7 Hũ Tài Chính', 'en'), 'List of 7 Financial Jars');
  assert.equal(
    localizeText('Chọn mẫu phù hợp hoặc tự điều chỉnh các hũ theo thu nhập và phong cách sống của bạn.', 'en'),
    'Choose a suitable plan or customize the jars for your income and lifestyle.',
  );
  assert.equal(localizeText('Khả dụng · 1 hũ', 'en'), 'Available · 1 jar');
  assert.equal(localizeText('Khả dụng · 2 hũ', 'en'), 'Available · 2 jars');
  assert.equal(localizeText('Thu +₫0', 'en'), 'Income +₫0');
  assert.equal(localizeText('Tối đa ₫2,504,027', 'en'), 'Maximum ₫2,504,027');
  assert.equal(localizeText('Lần reset tiếp theo: 25/10/2026', 'en'), 'Next reset: 25/10/2026');
  assert.equal(localizeText('Dư chuyển tiếp', 'en'), 'Carried-over balance');
  assert.equal(localizeText('Tổng vốn còn lại', 'en'), 'Total remaining principal');
  assert.equal(localizeText('Hồ sơ cá nhân', 'en'), 'Personal profile');
  assert.equal(localizeText('Lưu thủ công: 29/09/2026', 'en'), 'Saved manually: 29/09/2026');
  assert.equal(localizeText('Đã cập nhật hồ sơ cá nhân.', 'en'), 'Profile updated.');
});

test('translation never changes the VND unit of the USD-to-VND exchange rate', () => {
  const rate = '1 USD = 26000 VND';
  assert.equal(localizeText(rate, 'en'), rate);
  assert.equal(localizeText(rate, 'vi'), rate);
  assert.equal(localizeText('Số tiền muốn rút (VND)', 'en'), 'Withdrawal amount (VND)');
});

test('every built-in transaction category has an English label without changing its stored name', () => {
  const categories = [
    ...Object.values(DEFAULT_EXPENSE_CATEGORIES_BY_JAR_CODE).flat(),
    ...DEFAULT_INCOME_CATEGORIES,
  ];
  for (const category of categories) {
    const english = localizeText(category.name, 'en');
    assert.doesNotMatch(english, /[À-ỹĐđ]/u, `Missing translation: ${category.name}`);
    assert.equal(localizeText(category.name, 'vi'), category.name);
  }
});

test('compact VND values use English units in English mode', () => {
  try {
    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'en', currency: 'VND' });
    assert.equal(formatShortVND(3_500_000), '3.5M ₫');
    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'vi', currency: 'VND' });
    assert.equal(formatShortVND(3_500_000), '3.50 triệu ₫');
  } finally {
    setRuntimePreferences(DEFAULT_APP_PREFERENCES);
  }
});

test('native cycle select renders every label in the chosen language', () => {
  const props = {
    transactions: [],
    jars: [],
    customCategories: [],
    onDeleteTransaction: () => undefined,
    onEditTransaction: () => undefined,
    onOpenTransactionModal: () => undefined,
    bankAccounts: [],
    onUpdateBankBalance: async () => undefined,
    monthlySummaries: [],
    resetDay: 25,
    activeJarIds: [],
  };
  try {
    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'en' });
    const english = renderToStaticMarkup(React.createElement(TransactionList, props));
    assert.match(english, /<optgroup label="By financial cycle">/);
    assert.match(english, /Current cycle:/);
    assert.match(english, />All history<\/option>/);
    assert.doesNotMatch(english, /Theo chu kỳ tài chính|Chu kỳ hiện tại/);

    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'vi' });
    const vietnamese = renderToStaticMarkup(React.createElement(TransactionList, props));
    assert.match(vietnamese, /<optgroup label="Theo chu kỳ tài chính">/);
    assert.match(vietnamese, /Chu kỳ hiện tại:/);
  } finally {
    setRuntimePreferences(DEFAULT_APP_PREFERENCES);
  }
});
