import { test, expect, type Page } from '@playwright/test';
import { characterFixture } from './fixture';

async function rewardToast(page: Page, light: boolean) {
  const fixture = await characterFixture(page, { light, language: light ? 'vi' : 'en' });
  await page.goto('/');
  await page.getByRole('button', { name: light ? 'Giao dịch' : 'Transactions', exact: true }).click();
  const mainY = await page.locator('main').evaluate(e => e.getBoundingClientRect().y);
  await page.getByRole('button', { name: light ? 'Ghi Nhận Giao Dịch Mới' : 'New transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#transaction-amount').fill('1000');
  await dialog.locator('input[maxlength="500"]').fill('Synthetic toast expense');
  await dialog.getByRole('button', { name: light ? 'Lưu Giao Dịch' : 'Save Transaction', exact: true }).click();
  const toast = page.locator('.app-toast');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(light ? '+20 điểm' : '+20 draw points');
  return { fixture, toast, mainY };
}

test('success feedback floats at the corner without shifting content and disappears automatically', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { fixture, toast, mainY } = await rewardToast(page, light);
  await expect(page.locator('main')).toHaveJSProperty('tagName', 'MAIN');
  expect(await page.locator('main').evaluate(e => e.getBoundingClientRect().y)).toBe(mainY);
  await expect(page.locator('[data-toast-viewport]')).toHaveCSS('position', 'fixed');
  const box = await toast.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y).toBeGreaterThan(60); expect(box!.width).toBeLessThanOrEqual(368);
  expect(viewport.width - box!.x - box!.width).toBeLessThanOrEqual(20);
  await toast.screenshot({ path: info.outputPath('success-toast.png') });
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  expect(fixture.state().bonusPoints).toBe(20);
  expect(fixture.finance().transactions.some(t => t.description === 'Synthetic toast expense')).toBe(true);
});

test('keyboard focus pauses dismissal and leaving resumes it', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { toast } = await rewardToast(page, light);
  await toast.getByRole('button').focus();
  await page.waitForTimeout(5500);
  await expect(toast).toBeVisible();
  await page.getByRole('button', { name: light ? 'Giao dịch' : 'Transactions', exact: true }).focus();
  await expect(toast).toHaveCount(0, { timeout: 6500 });
});

test('unrelated app renders do not keep restarting the auto-dismiss timer', async ({ page }, info) => {
  await page.clock.install();
  const light = info.project.name === 'phone-light';
  const { toast } = await rewardToast(page, light);
  await page.clock.fastForward(3000);
  await expect(toast).toBeVisible();
  await page.getByRole('button', { name: light ? 'Ẩn toàn bộ số tiền' : 'Hide all amounts', exact: true }).click();
  await page.clock.fastForward(2100);
  await expect(toast).toHaveCount(0, { timeout: 500 });
});

test('bank save errors remain inline instead of vanishing like successful feedback', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light, language: light ? 'vi' : 'en' });
  fixture.finance().bankAccounts = [{ id: 'bank-toast', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'SYNTHETIC', balance: 1000, openingBalance: 1000, balanceReconciled: true, status: 'connected', lastSynced: '', isManuallyAdded: true }];
  await page.route('**/api/bank/balance', route => route.fulfill({ status: 503, json: { error: 'Synthetic bank save error' } }));
  await page.goto('/');
  await page.getByRole('button', { name: light ? 'Giao dịch' : 'Transactions', exact: true }).click();
  const card = page.getByRole('article').filter({ hasText: '123456789' });
  await card.locator('input').fill('2000'); await card.getByRole('button').click();
  const error = page.getByRole('alert').filter({ hasText: 'Synthetic bank save error' });
  await expect(error).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(error).toBeVisible(); await expect(page.locator('.app-toast')).toHaveCount(0);
  expect(fixture.finance().bankAccounts[0].balance).toBe(1000);
});

test('success notifications inside native reward dialogs are visible once in the top layer and auto-dismiss', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', fragments: 20 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const prize = page.locator('article.reward-prize').filter({ has: page.getByRole('heading', { name: 'Starlight hat', exact: true }) });
  await prize.getByRole('button', { name: /Exchange/ }).click();
  const toast = page.locator('.app-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Item exchanged.');
  expect(await toast.evaluate(e => Boolean(e.closest('dialog[open]')))).toBe(true);
  await expect(page.getByText('Item exchanged. You can equip it in your wardrobe.', { exact: true })).toHaveCount(1);
  await expect(toast).toHaveCount(0, { timeout: 8000 });
  expect(fixture.state().ownedItemIds).toContain('hat-gold');
});
