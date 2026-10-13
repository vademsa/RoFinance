import { test, expect } from '@playwright/test';
import { COSMETICS } from '../../shared/character';
import { characterFixture } from './fixture';

async function openProfile(page: import('@playwright/test').Page, vi = false) {
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Hồ sơ nhân vật' : 'Character profile', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.waitForTimeout(1200);
}

test('all public prizes are paginated in a popup, owned inventory stays paginated below, browsing never spends points', async ({ page }, info) => {
  test.setTimeout(90000);
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await openProfile(page);
  const state = structuredClone(fixture.state());
  const finance = structuredClone(fixture.finance());
  const writes = fixture.writes();
  const owned = page.locator('.character-owned-collection');
  await expect(owned.locator('.character-item')).toHaveCount(6);
  await expect(owned).not.toContainText('Not owned');
  const ownedPager = owned.getByRole('navigation', { name: 'Owned items pagination' });
  await expect(ownedPager).toContainText('Page 1 / 2');
  await ownedPager.getByRole('button', { name: 'Next page' }).click();
  await expect(owned.locator('.character-item')).toHaveCount(1);
  await expect(ownedPager.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.locator('.reward-prize')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'View rewards', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Reward catalogue' });
  await expect(dialog).toBeVisible();
  const pager = dialog.getByRole('navigation', { name: 'Reward catalogue pagination' });
  await expect(pager).toContainText('Page 1 / 19');
  const seen: string[] = [];
  for (let index = 1; index <= 19; index++) {
    await expect(pager).toContainText(`Page ${index} / 19`);
    const names = await dialog.locator('.reward-prize h3').allTextContents();
    expect(names.length).toBe(index === 19 ? 4 : 6);
    seen.push(...names);
    if (index !== 19) await pager.getByRole('button', { name: 'Next page' }).click();
  }
  expect(seen).toEqual(COSMETICS.filter((item) => !item.starter && !item.secret).map((item) => item.en));
  await expect(pager.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Rare', exact: true }).click();
  await expect(pager).toContainText('Page 1 / 5');
  await dialog.getByLabel('Filter item category', { exact: true }).selectOption('shirt');
  await expect(pager).toContainText('Page 1 / 1');
  await expect(dialog.locator('.reward-prize')).toHaveCount(4);
  await expect(dialog.locator('.reward-prize-odds')).toHaveCount(0);
  await expect(dialog).not.toContainText(/Comet crown|Singularity crown|Eclipse coat/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.state()).toEqual(state);
  expect(fixture.finance()).toEqual(finance);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.exchangeRequests).toHaveLength(0);
});

test('owned filters reset pages, previewing on a later page preserves pagination and saved outfit', async ({ page }, info) => {
  const publicItems = COSMETICS.filter((item) => !item.secret);
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: publicItems.map((item) => item.id) });
  await openProfile(page);
  const owned = page.locator('.character-owned-collection');
  const pager = owned.getByRole('navigation', { name: 'Owned items pagination' });
  await expect(pager).toContainText('Page 1 / 20');
  await pager.getByRole('button', { name: 'Next page' }).click();
  const candidate = owned.locator('.character-item').first();
  const itemName = await candidate.locator('h3').textContent();
  await candidate.getByRole('button', { name: /^(Try on|Previewing)$/ }).click();
  await expect(pager).toContainText('Page 2 / 20');
  await page.getByRole('button', { name: 'Save outfit' }).click();
  const item = COSMETICS.find((candidate) => candidate.en === itemName)!;
  await expect.poll(() => fixture.state().equipped[item.slot]).toBe(item.id);
  await owned.getByRole('button', { name: 'Shirts', exact: true }).click();
  await expect(pager).toContainText('Page 1 / 3');
  await expect(owned.locator('.character-item')).toHaveCount(6);
  await pager.getByRole('button', { name: 'Next page' }).click();
  await pager.getByRole('button', { name: 'Next page' }).click();
  await expect(owned.locator('.character-item')).toHaveCount(5);
  await owned.getByRole('button', { name: 'All items', exact: true }).click();
  await expect(pager).toContainText('Page 1 / 20');
});

test('popup is theme-safe, bounded on small screens, traps focus, closes on backdrop and restores scrolling', async ({ page }, info) => {
  test.setTimeout(60000);
  await characterFixture(page, { light: info.project.name === 'phone-light', language: 'vi' });
  await openProfile(page, true);
  const overflow = await page.evaluate(() => document.body.style.overflow);
  const trigger = page.getByRole('button', { name: 'Xem phần thưởng', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Danh sách phần thưởng' });
  await expect(dialog.getByRole('button', { name: 'Đóng phần thưởng' })).toBeFocused();
  await expect(dialog.getByRole('navigation', { name: 'Phân trang phần thưởng' })).toContainText('Trang 1 / 16');
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThan(812);
    await expect(dialog.getByRole('navigation', { name: 'Phân trang phần thưởng' })).toBeInViewport();
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: 812 });
  await page.screenshot({ path: info.outputPath('rewards-popup.png') });
  await dialog.getByRole('heading', { name: 'Danh sách phần thưởng' }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(overflow);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Đóng phần thưởng' }).click();
  await expect(dialog).toHaveCount(0);
});

test('won secrets appear in paginated inventory and popup, undiscovered secret identities remain hidden', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: ['hat-comet'] });
  await openProfile(page);
  await page.locator('.character-owned-collection').getByRole('button', { name: 'Hats', exact: true }).click();
  await expect(page.locator('.character-item')).toHaveCount(2);
  await expect(page.locator('.character-owned-collection')).toContainText('Comet crown');
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Legendary', exact: true }).click();
  await dialog.getByLabel('Filter item category', { exact: true }).selectOption('hat');
  await expect(dialog.locator('.reward-prize')).toHaveCount(3);
  await expect(dialog).toContainText('Comet crown');
  await expect(dialog).not.toContainText('Singularity crown');
});
