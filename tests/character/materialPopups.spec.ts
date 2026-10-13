import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';

test('material submission blocks dismissal while awaiting backend confirmation and consumes only once', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint'], duplicateItemCounts: { 'shirt-mint': 2 } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/character/recycle', async (route) => { await gate; await route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Recycle Mint shirt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Recycle items', exact: true });
  await dialog.getByRole('button', { name: 'Recycle 2 spare copies', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm recycling', exact: true }).click();
  try {
    await expect(dialog.getByRole('button', { name: 'Close item action' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    expect(fixture.materialRequests).toHaveLength(0);
    expect(fixture.state().duplicateItemCounts?.['shirt-mint']).toBe(2);
  } finally { release(); }
  await expect(dialog.locator('.duplicate-result')).toContainText('+20 reward points');
  expect(fixture.materialRequests).toHaveLength(1);
  await expect(dialog.getByRole('button', { name: 'Close item action' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close item action' }).click();
  await expect(page.locator('.character-profile .character-tabs').getByRole('button', { name: 'Wardrobe', exact: true })).toBeFocused();
});

test('item actions open only on request; opening, cancelling and switching popups never consume spares', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint', 'shirt-gold', 'shirt-phoenix'], duplicateItemCounts: { 'shirt-mint': 7, 'shirt-gold': 7, 'shirt-phoenix': 2 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.waitForTimeout(1200);
  const before = structuredClone(fixture.state()), finance = structuredClone(fixture.finance()), writes = fixture.writes();
  await expect(page.locator('.duplicate-workshop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.locator('.duplicate-workshop')).toHaveCount(0);
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  const recycle = page.getByRole('button', { name: 'Recycle Mint shirt', exact: true });
  await recycle.click();
  let dialog = page.getByRole('dialog', { name: 'Recycle items', exact: true });
  await expect(dialog.getByLabel('Copies Mint shirt', { exact: true })).toHaveValue('2');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Recycle 2 spare copies', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close item action' }).click();
  await expect(recycle).toBeFocused();
  await page.getByRole('button', { name: 'Fuse Starlight shirt', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Fuse items', exact: true });
  await expect(dialog.getByLabel('Material rarity')).toHaveValue('special');
  await expect(dialog.getByLabel('Copies Starlight shirt', { exact: true })).toHaveValue('7');
  await expect(dialog.getByLabel('Copies Mint shirt', { exact: true })).toHaveCount(0);
  // Native dialog keeps keyboard focus inside; Escape closes without a mutation.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Close item action' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await recycle.click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fuse Phoenix shirt', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recycle Phoenix shirt', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recycle items', exact: true })).toBeVisible();
  expect(fixture.materialRequests).toHaveLength(0);
  expect(fixture.state()).toEqual(before);
  expect(fixture.finance()).toEqual(finance); expect(fixture.writes()).toBe(writes);
  await page.screenshot({ path: info.outputPath('item-action-popup.png') });
});
