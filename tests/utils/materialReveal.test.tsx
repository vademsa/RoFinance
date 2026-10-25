import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialReveal } from '../../src/components/character/MaterialReveal';
import type { MaterialResult } from '../../shared/character';

const materials = [{ itemId: 'shirt-mint', count: 5 }, { itemId: 'hat-mint', count: 2 }];
const result: MaterialResult = { kind: 'fuse', consumed: materials, points: 0, itemId: 'shirt-rose', duplicate: false };
test('gather, wait and charge phases never reveal an unconfirmed or premature prize', () => {
  for (const phase of ['gathering', 'waiting', 'charging'] as const) {
    const html = renderToStaticMarkup(<MaterialReveal phase={phase} kind="fuse" materials={materials} result={phase === 'charging' ? result : null} language="en"/>);
    assert.equal((html.match(/class="material-orbit-item"/g) || []).length, 7);
    assert.doesNotMatch(html, /data-cosmetic-id="shirt-rose"|class="duplicate-result"|FUSION COMPLETE/);
    assert.match(html, /aria-busy="true"/);
  }
});
test('revealed fusion shows exactly the backend ID with its rarity aura and duplicate notice in both languages', () => {
  for (const language of ['en', 'vi'] as const) {
    const html = renderToStaticMarkup(<MaterialReveal phase="complete" kind="fuse" materials={materials} result={{ ...result, duplicate: true }} language={language}/>);
    assert.match(html, /data-item-id="shirt-rose"/); assert.match(html, /data-cosmetic-id="shirt-rose"/);
    assert.match(html, /data-aura="purple"/); assert.doesNotMatch(html, /material-orbit-item|data-cosmetic-id="shirt-mint"/);
    assert.match(html, language === 'en' ? /1 spare copy added/ : /thêm 1 bản dư/);
  }
});
test('recycling reveals real credited points instead of inventing equipment', () => {
  const recycle: MaterialResult = { kind: 'recycle', consumed: [{ itemId: 'shirt-mint', count: 2 }], itemId: null, duplicate: false, points: 20 };
  const html = renderToStaticMarkup(<MaterialReveal phase="complete" kind="recycle" materials={recycle.consumed} result={recycle} language="en"/>);
  assert.match(html, /\+20 reward points/); assert.match(html, /RECYCLING COMPLETE/);
  assert.doesNotMatch(html, /data-cosmetic-id=|New item added/);
});
