import { test, expect, type Page } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

async function openRewards(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
}
const workshop = (page: Page) => page.locator('.duplicate-workshop');

test('recycle consumes two spares only after confirmation, credits one draw, and preserves the original outfit and finance', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', spentPoints: 40, fragments: 31, ownedItemIds: ['shirt-mint'], duplicateItemCounts: { 'shirt-mint': 2 } });
  await openRewards(page);
  const finance = structuredClone(fixture.finance()), writes = fixture.writes();
  const before = structuredClone(fixture.state());
  await expect(page.getByRole('button', { name: /Draw an item/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Recycle Mint shirt', exact: true }).click();
  await workshop(page).getByLabel('Copies Mint shirt', { exact: true }).selectOption('1');
  await expect(workshop(page).getByRole('button', { name: 'Recycle 2 spare copies', exact: true })).toBeDisabled();
  await workshop(page).getByLabel('Copies Mint shirt', { exact: true }).selectOption('2');
  await workshop(page).getByRole('button', { name: 'Recycle 2 spare copies', exact: true }).click();
  expect(fixture.materialRequests).toHaveLength(0);
  await workshop(page).getByRole('button', { name: 'Confirm recycling', exact: true }).evaluate((el) => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
  await expect(workshop(page).locator('.duplicate-result')).toContainText('+20 reward points');
  await expect(page.getByRole('button', { name: /Draw an item/ })).toBeEnabled();
  expect(fixture.materialRequests).toHaveLength(1);
  expect(fixture.state().duplicateItemCounts?.['shirt-mint']).toBeUndefined();
  expect(fixture.state().recycledPoints).toBe(20);
  expect(fixture.state().ownedItemIds).toEqual(before.ownedItemIds);
  expect(fixture.state().equipped).toEqual(before.equipped);
  expect(fixture.state().fragments).toBe(31);
  expect(fixture.state().awards).toEqual(before.awards);
  expect(fixture.finance()).toEqual(finance); expect(fixture.writes()).toBe(writes);
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize(info.project.name === 'phone-light' ? { width: 375, height: 812 } : { width: 1280, height: 900 });
  await workshop(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('recycled.png') });
  await workshop(page).getByRole('button', { name: 'Close item action', exact: true }).click();
  await expect(page.locator('.character-profile .character-tabs').getByRole('button', { name: 'Rewards', exact: true })).toBeFocused();
});

test('fusion accepts seven same-rarity spares across IDs and only equips the exact owned server output', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint', 'hat-mint'], duplicateItemCounts: { 'shirt-mint': 5, 'hat-mint': 2 } });
  await openRewards(page);
  const finance = structuredClone(fixture.finance()), writes = fixture.writes();
  await page.getByRole('button', { name: 'Fuse Mint shirt', exact: true }).click();
  await expect(workshop(page).getByLabel('Material rarity').locator('option')).toHaveCount(3);
  await workshop(page).getByLabel('Copies Mint shirt', { exact: true }).selectOption('5');
  await workshop(page).getByLabel('Copies Mint hat', { exact: true }).selectOption('2');
  await workshop(page).getByRole('button', { name: 'Fuse 7 spare copies', exact: true }).click();
  expect(fixture.materialRequests).toHaveLength(0);
  await workshop(page).getByRole('button', { name: 'Confirm fusion', exact: true }).click();
  await expect(workshop(page).locator('.duplicate-result')).toContainText('Rose shirt');
  expect(fixture.state().ownedItemIds).toContain('shirt-rose');
  expect(fixture.state().duplicateItemCounts).toEqual({});
  expect(fixture.state().spentPoints).toBe(0);
  expect(fixture.state().equipped.shirt).toBe('shirt-basic');
  await workshop(page).getByRole('button', { name: 'Close item action', exact: true }).click();
  await page.getByRole('button', { name: 'Wardrobe', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  const prize = page.locator('.character-owned-collection .character-item').filter({ has: page.getByRole('heading', { name: 'Rose shirt', exact: true }) });
  await prize.getByRole('button', { name: 'Try on', exact: true }).click();
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped.shirt).toBe('shirt-rose');
  expect(fixture.finance()).toEqual(finance); expect(fixture.writes()).toBe(writes);
});

for (const kind of ['recycle', 'fuse'] as const) test(`uncertain ${kind} survives reload and confirms original receipt without consuming or crediting twice`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['shirt-mint'], duplicateItemCounts: { 'shirt-mint': kind === 'fuse' ? 7 : 2 }, failMaterialAfterCommit: true });
  await openRewards(page); const finance = structuredClone(fixture.finance());
  await page.getByRole('button', { name: kind === 'fuse' ? 'Fuse Mint shirt' : 'Recycle Mint shirt', exact: true }).click();
  await workshop(page).getByLabel('Copies Mint shirt', { exact: true }).selectOption(kind === 'fuse' ? '7' : '2');
  await workshop(page).getByRole('button', { name: kind === 'fuse' ? 'Fuse 7 spare copies' : 'Recycle 2 spare copies', exact: true }).click();
  await workshop(page).getByRole('button', { name: kind === 'fuse' ? 'Confirm fusion' : 'Confirm recycling', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeEnabled();
  const afterCommit = structuredClone(fixture.state());
  await page.reload();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.materialRequests).toHaveLength(2);
  expect(fixture.materialRequests[0]).toBe(fixture.materialRequests[1]);
  expect(fixture.state()).toEqual(afterCommit);
  expect(fixture.finance()).toEqual(finance);
  await workshop(page).getByRole('button', { name: 'Close item action', exact: true }).click();
  await expect(page.locator('.character-profile .character-tabs').getByRole('button', { name: 'Wardrobe', exact: true })).toBeFocused();
});

test('delayed server confirmation keeps every visible neighbour fixed, hides time/progress, and preserves the won duplicate ID', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawDelayMs: 2500, drawRoll: 1895000, ownedItemIds: ['shirt-rose'] });
  await openRewards(page);
  await startDraw(page);
  const track = page.locator('.reward-reel-track');
  await expect(track).toHaveAttribute('data-settling', 'true');
  const waiting = await track.locator('.reward-reel-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-item-id')));
  const initialOffset = await track.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(150);
  // The real-time presentation now starts immediately while the backend is
  // pending; confirmation may change only the offscreen landing card.
  expect(await track.evaluate((el) => getComputedStyle(el).transform)).not.toBe(initialOffset);
  await expect.poll(() => fixture.state().duplicateItemCounts?.['shirt-rose']).toBe(1);
  await expect(track.locator('[data-landing="true"]')).toHaveAttribute('data-item-id', 'shirt-rose');
  const confirmed = await track.locator('.reward-reel-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-item-id')));
  expect(confirmed.slice(0, 50)).toEqual(waiting.slice(0, 50));
  expect(confirmed.slice(51)).toEqual(waiting.slice(51));
  expect(confirmed[50]).toBe('shirt-rose');
  await expect(page.locator('.reward-reel-progress, .reward-stage-status')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.reward-stage')).not.toContainText(/\b\d+s\b/);
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await expect(page.locator('.reward-result')).toContainText('1 spare copy added');
  expect(await track.locator('.reward-reel-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-item-id')))).toEqual(confirmed);
  expect(fixture.state().duplicateItemCounts?.['shirt-rose']).toBe(1);
  expect(fixture.state().fragments).toBe(0);
  expect(fixture.drawRequests).toHaveLength(1);
});
