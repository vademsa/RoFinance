import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { Jar } from '../../src/types';
import { ReceiveQRModal } from '../../src/components/ReceiveQRModal';
import { createVietQRPayload } from '../../src/utils/vietqrPayload';
import { DEFAULT_APP_PREFERENCES, setRuntimePreferences } from '../../src/lib/preferences';

const jar: Jar = { id: 'test', code: 'NEC', name: 'Synthetic jar', percentage: 20, bankCode: 'TCB', bankName: 'Techcombank',
  accountNumber: '123456789', accountName: 'SYNTHETIC', description: '', color: '#000000',
  cycleAllocation: 2000000, targetBudget: 2800000, currentSpent: 1500000,
  carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 300000 }],
  transferredIn: [{ sourceCycleStart: '2026-09-25', sourceCycleEnd: '2026-10-24', amount: 500000 }] };
const render = (item: Jar | null = jar, hidden = false) => renderToStaticMarkup(<ReceiveQRModal jar={item} onClose={() => {}} isAmountsHidden={hidden} />);
const paths = (markup: string) => [...markup.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(match => match[1]);
const expectedQR = (amount: number) => renderToStaticMarkup(<QRCodeSVG size={240} level="M" includeMargin={false}
  value={createVietQRPayload({ bankCode: jar.bankCode, accountNumber: jar.accountNumber, accountName: jar.accountName, amount })} />);
const qrOnly = (markup: string) => markup.match(/<svg\b[^>]*\bid="receive-vietqr-code"[\s\S]*?<\/svg>/)![0];

test('QR field and encoded amount use the cycle allocation, never carryover, transfers or remaining spending limit', () => {
  setRuntimePreferences(DEFAULT_APP_PREFERENCES);
  const original = structuredClone(jar);
  const html = render();
  assert.match(html, /value="2\.000\.000"/);
  assert.deepEqual(paths(qrOnly(html)), paths(expectedQR(2000000)));
  assert.deepEqual(jar, original);
});

test('legacy budgets infer the cycle allocation without mutating the jar; zero allocation stays zero', () => {
  const { cycleAllocation, ...legacy } = jar;
  assert.deepEqual(paths(qrOnly(render(legacy))), paths(expectedQR(2000000)));
  assert.deepEqual(paths(qrOnly(render({ ...jar, cycleAllocation: 0, targetBudget: 800000 }))), paths(expectedQR(0)));
  assert.equal(render(null), '');
});

test('hidden amounts remain masked and USD display never changes the VND payment amount embedded in QR', () => {
  setRuntimePreferences({ ...DEFAULT_APP_PREFERENCES, currency: 'USD', language: 'en', usdVndRate: 25000 });
  try {
    const html = render(jar, true);
    assert.match(html, /type="password"[^>]*value="80"/);
    assert.deepEqual(paths(qrOnly(html)), paths(expectedQR(2000000)));
  } finally { setRuntimePreferences(DEFAULT_APP_PREFERENCES); }
});
