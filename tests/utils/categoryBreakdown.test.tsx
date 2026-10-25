import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CategoryBreakdown } from '../../src/components/CategoryBreakdown';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../../src/lib/preferences';
import { getCategoryTotals } from '../../src/utils/analytics';

test('category breakdown localizes built-ins but preserves custom names and uses only recorded amounts', () => {
  try {
    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'en' });
    const markup = renderToStaticMarkup(<CategoryBreakdown categories={[
      { name: 'Tiền điện', amount: 100, count: 1 },
      { name: 'Tiền điện riêng', amount: 300, count: 2, isCustom: true },
    ]} chartLabel="Expense distribution" emptyLabel="No transactions" isAmountsHidden={false} />);
    assert.match(markup, /Electricity/);
    assert.match(markup, /Tiền điện riêng/);
    assert.match(markup, /25%/);
    assert.match(markup, /75%/);
    assert.doesNotMatch(markup, /Other categories/);
    assert.match(markup, /Recorded total/);
  } finally { setRuntimePreferences(DEFAULT_APP_PREFERENCES); }
});

test('hidden category charts expose no names, financial values, percentages or SVG data', () => {
  const markup = renderToStaticMarkup(<CategoryBreakdown categories={[
    { name: 'PRIVATE-CATEGORY', amount: 987654321, count: 123 },
  ]} chartLabel="Expense distribution" emptyLabel="Empty" isAmountsHidden />);
  assert.doesNotMatch(markup, /PRIVATE-CATEGORY|987654321|123|%|<svg|<li|Recorded total/);
});

test('empty breakdown shows the empty state instead of inventing a slice', () => {
  const markup = renderToStaticMarkup(<CategoryBreakdown categories={[]} chartLabel="Income distribution" emptyLabel="NO-RECORDED-INCOME" isAmountsHidden={false} />);
  assert.match(markup, /NO-RECORDED-INCOME/);
  assert.doesNotMatch(markup, /<svg|%|<li/);
});

test('transaction count remains an accessible text-only compact button', () => {
  const markup = renderToStaticMarkup(<CategoryBreakdown categories={[{ name: 'Category', amount: 100, count: 5 }]}
    chartLabel="Expenses" emptyLabel="Empty" isAmountsHidden={false} onViewTransactions={() => undefined} />);
  const button = markup.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(button, /5 /);
  assert.match(button, /aria-label=/);
  assert.match(button, /min-h-6/);
  assert.doesNotMatch(button, /↗|<svg|<span|min-h-11/);
});

test('legacy unnamed categories use a bilingual uncategorized label, not a synthetic Other group', () => {
  try {
    setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, language: 'en' });
    const categories = getCategoryTotals([{ id: 'legacy', type: 'expense', jarId: 'nec', category: '', date: '2026-10-01', amount: 100, description: '' }], 'expense');
    const markup = renderToStaticMarkup(<CategoryBreakdown categories={categories} chartLabel="Expenses" emptyLabel="Empty" isAmountsHidden={false} />);
    assert.match(markup, /Uncategorized/);
    assert.doesNotMatch(markup, /Chưa phân loại|Other categories/);
  } finally { setRuntimePreferences(DEFAULT_APP_PREFERENCES); }
});
