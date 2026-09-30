import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IncomeAllocatorModal } from '../components/IncomeAllocatorModal';
import { AIAdvisorDrawer } from '../components/AIAdvisorDrawer';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../lib/preferences';
import { formatVND } from './formatters';
import type { Jar } from '../types';

const jar: Jar = {
  id: 'jar-1', code: 'NEC', name: 'Thiết yếu', percentage: 100,
  bankName: 'Ngân hàng', bankCode: 'VCB', accountNumber: '', accountName: '',
  color: '#6366f1', description: '', targetBudget: 11_000_000, currentSpent: 0,
  carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 1_000_000 }],
};

test('allocation modal masks income, preset amounts, allocation and carryover in hidden mode', () => {
  try {
    setRuntimePreferences(DEFAULT_APP_PREFERENCES);
    const props = {
      isOpen: true,
      onClose: () => undefined,
      jars: [jar],
      currentIncome: 10_000_000,
      onApplyAllocation: () => undefined,
    };
    const visible = renderToStaticMarkup(React.createElement(IncomeAllocatorModal, props));
    assert.match(visible, new RegExp(formatVND(10_000_000)));
    assert.match(visible, new RegExp(formatVND(1_000_000)));

    const hidden = renderToStaticMarkup(React.createElement(IncomeAllocatorModal, { ...props, isAmountsHidden: true }));
    assert.match(hidden, /type="password"/);
    assert.match(hidden, /•••••••• ₫/);
    assert.doesNotMatch(hidden, /Gợi ý nhanh:/);
    assert.doesNotMatch(hidden, new RegExp(formatVND(10_000_000)));
    assert.doesNotMatch(hidden, new RegExp(formatVND(1_000_000)));
  } finally {
    setRuntimePreferences(DEFAULT_APP_PREFERENCES);
  }
});

test('AI chat content and draft input are masked in hidden mode', () => {
  const html = renderToStaticMarkup(React.createElement(AIAdvisorDrawer, {
    isOpen: true,
    onClose: () => undefined,
    jars: [],
    monthlyIncome: 0,
    transactions: [],
    isAmountsHidden: true,
  }));
  assert.match(html, /aria-label="Nội dung được ẩn để bảo vệ số tiền"/);
  assert.match(html, /type="password"/);
});
