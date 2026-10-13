import { expect, test } from '@playwright/test';
import { characterFixture } from './fixture';

test('two-panel fusion moves seven copies inward, waits for the server, and reveals its exact item in the popup', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint', 'hat-mint'], duplicateItemCounts: { 'shirt-mint': 5, 'hat-mint': 2 } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/character/fuse', async (route) => { await gate; await route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Fuse Mint shirt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fuse items', exact: true });
  await expect(dialog.locator('.material-slots [data-item-id]')).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Add Mint hat', exact: true }).click({ clickCount: 2 });
  await expect(dialog.locator('.material-slots [data-item-id]')).toHaveCount(7);
  await dialog.getByRole('button', { name: 'Remove Mint shirt · 1', exact: true }).click();
  await expect(dialog.getByLabel('Copies Mint shirt', { exact: true })).toHaveValue('4');
  await dialog.getByRole('button', { name: 'Add Mint shirt', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Add Mint hat', exact: true })).toBeDisabled();
  // Filling the basket must not dim the inventory artwork and item names.
  await expect(dialog.getByRole('button', { name: 'Add Mint hat', exact: true })).toHaveCSS('opacity', '1');
  const geometry = await dialog.evaluate((element) => {
    const left = element.querySelector('.material-inventory')!.getBoundingClientRect();
    const right = element.querySelector('.material-basket')!.getBoundingClientRect();
    return { leftOfRight: left.right <= right.left, noOverflow: element.scrollWidth <= element.clientWidth };
  });
  expect(geometry).toEqual({ leftOfRight: true, noOverflow: true });
  for (const width of info.project.name === 'phone-light' ? [320, 375] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Fuse 7 spare copies', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Clear selection', exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: info.project.name === 'phone-light' ? 812 : 900 });
  await page.screenshot({ path: info.outputPath('fusion-basket.png') });
  await dialog.getByRole('button', { name: 'Fuse 7 spare copies', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm fusion', exact: true }).click();
  try {
    await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'gathering');
    await expect(dialog.locator('.material-orbit-item')).toHaveCount(7);
    const first = dialog.locator('.material-orbit-item').first();
    const start = await first.evaluate((el) => getComputedStyle(el).transform);
    await expect.poll(() => first.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
    await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'waiting');
    await expect(dialog.locator('.duplicate-result')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Close item action' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(fixture.materialRequests).toHaveLength(0);
  } finally { release(); }
  await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'charging');
  await expect(dialog.locator('.duplicate-result')).toHaveCount(0);
  await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'complete');
  await expect(dialog.locator('.duplicate-result')).toHaveAttribute('data-item-id', 'shirt-rose');
  await expect(dialog.locator('.duplicate-result')).toContainText('Rose shirt');
  await expect(dialog.locator('.duplicate-result .cosmetic-artwork')).toHaveAttribute('data-cosmetic-id', 'shirt-rose');
  await expect(dialog.getByRole('button', { name: 'Fuse again' })).toBeFocused();
  expect(fixture.materialRequests).toHaveLength(1);
  expect(fixture.state().duplicateItemCounts?.['shirt-mint'] ?? 0).toBe(0);
  expect(fixture.state().duplicateItemCounts?.['hat-mint'] ?? 0).toBe(0);
  await page.screenshot({ path: info.outputPath('fusion-result.png') });
  await dialog.getByRole('button', { name: 'Fuse again' }).click();
  await expect(dialog.locator('.material-workspace')).toBeVisible();
  await expect(dialog.locator('.duplicate-result')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Fuse 7 spare copies', exact: true })).toBeDisabled();
});

test('recycling can repeat inside the popup with a points result and respects reduced motion', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint'], duplicateItemCounts: { 'shirt-mint': 4 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Recycle Mint shirt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Recycle items', exact: true });
  for (let run = 0; run < 2; run++) {
    if (run) await dialog.getByLabel('Copies Mint shirt', { exact: true }).selectOption('2');
    await dialog.getByRole('button', { name: 'Recycle 2 spare copies', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm recycling', exact: true }).click();
    await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'complete');
    await expect(dialog.locator('.duplicate-result')).toContainText('+20 reward points');
    await expect(dialog.locator('.duplicate-result .cosmetic-artwork')).toHaveCount(0);
    expect(fixture.state().recycledPoints).toBe((run + 1) * 20);
    expect(fixture.materialRequests).toHaveLength(run + 1);
    await dialog.getByRole('button', { name: 'Recycle again' }).click();
  }
  expect(fixture.materialRequests[0]).not.toBe(fixture.materialRequests[1]);
  await expect(dialog.getByRole('button', { name: 'Recycle 2 spare copies', exact: true })).toBeDisabled();
  expect(fixture.state().ownedItemIds).toContain('shirt-mint');
});

test('fusion can continue inside the popup and a duplicate server output is shown without replacing its ID', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint'], duplicateItemCounts: { 'shirt-mint': 14 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Fuse Mint shirt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fuse items', exact: true });
  for (let run = 0; run < 2; run++) {
    if (run) await dialog.getByLabel('Copies Mint shirt', { exact: true }).selectOption('7');
    await dialog.getByRole('button', { name: 'Fuse 7 spare copies', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm fusion', exact: true }).click();
    await expect(dialog.locator('.material-reveal')).toHaveAttribute('data-phase', 'complete');
    await expect(dialog.locator('.duplicate-result')).toHaveAttribute('data-item-id', 'shirt-rose');
    if (run) await expect(dialog.locator('.duplicate-result')).toContainText('1 spare copy added');
    await dialog.getByRole('button', { name: 'Fuse again' }).click();
  }
  expect(fixture.materialRequests).toHaveLength(2);
  expect(fixture.materialRequests[0]).not.toBe(fixture.materialRequests[1]);
  expect(fixture.state().duplicateItemCounts?.['shirt-rose']).toBe(1);
  expect(fixture.state().duplicateItemCounts?.['shirt-mint'] ?? 0).toBe(0);
  expect(fixture.state().equipped.shirt).toBe('shirt-basic');
});
