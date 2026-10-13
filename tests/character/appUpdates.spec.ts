import { expect, test } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

test('release change blocks a stale draw, refresh waits for popup close, and durable UUID survives reload', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.waitForTimeout(1200);
  const finances = structuredClone(fixture.finance());
  const before = fixture.state().spentPoints;
  fixture.updateRelease();
  await startDraw(page);
  const dialog = page.getByRole('dialog', { name: 'Reward draw', exact: true });
  await expect(dialog).toContainText('An update is available');
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.state().spentPoints).toBe(before);
  const receipts = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('rofinance-character-pending-v1:')).map(([, value]) => JSON.parse(value)));
  expect(receipts).toHaveLength(1);
  const requestId = receipts[0].requestId;
  const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await reloaded;
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Confirm draw again/ }).click();
  await expect(page.getByRole('dialog').locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  expect(fixture.drawRequests).toEqual([requestId]);
  expect(fixture.state().spentPoints).toBe(before + 20);
  expect(fixture.finance()).toEqual(finances);
});

test('automatic refresh preserves an unfinished character draft until it is saved', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: /Privacy/ }).click();
  const nickname = page.locator('.character-input');
  await nickname.fill('Draft stays safe');
  await nickname.blur();
  fixture.updateRelease();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({ hasText: 'An update is available' })).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(nickname).toHaveValue('Draft stays safe');
  const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await page.getByRole('button', { name: 'Save privacy preferences' }).click();
  await reloaded;
  expect(fixture.state().nickname).toBe('Draft stays safe');
});

test('refresh waits for an in-flight finance save and does not discard the saved change', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).waitFor();
  await page.waitForTimeout(1200);
  let releaseSave!: () => void;
  const held = new Promise<void>((resolve) => { releaseSave = resolve; });
  let saveStarted = false;
  await page.route('**/api/data', async (route) => {
    if (route.request().method() === 'PUT') { saveStarted = true; await held; }
    await route.fallback();
  });
  await page.getByRole('button', { name: /Hide amounts|Hide amount|Ẩn số tiền/ }).click();
  await expect.poll(() => saveStarted).toBe(true);
  fixture.updateRelease();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({ hasText: 'An update is available' })).toBeVisible();
  let navigations = 0;
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.waitForTimeout(1600);
  expect(navigations).toBe(0);
  const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  releaseSave();
  await reloaded;
  expect(fixture.finance().isAmountsHidden).toBe(true);
  expect(fixture.drawRequests).toHaveLength(0);
});

test('a draw committed before an update returns its original receipt after refresh without another debit', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  const dialog = page.getByRole('dialog', { name: 'Reward draw', exact: true });
  await expect(dialog.getByRole('button', { name: /Confirm draw again/ })).toBeEnabled();
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.drawRequests).toHaveLength(1);
  fixture.updateRelease();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({ hasText: 'An update is available' })).toBeVisible();
  const reloaded = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await reloaded;
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Confirm draw again/ }).click();
  await expect(page.getByRole('dialog').locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  expect(fixture.drawRequests).toEqual([fixture.drawRequests[0], fixture.drawRequests[0]]);
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.state().drawCount).toBe(1);
});
