import { test, expect, type Page } from '@playwright/test';
import { COSMETICS } from '../../shared/character';
import { characterFixture } from './fixture';

async function openRewards(page: Page, vi = false) {
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Hồ sơ nhân vật' : 'Character profile', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.getByRole('button', { name: vi ? 'Quay thưởng' : 'Rewards', exact: true }).click();
  await page.waitForTimeout(1200);
}
for (const vi of [false, true]) test(`compact catalogue hides odds and redundant copy in ${vi ? 'Vietnamese' : 'English'}`, async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', language: vi ? 'vi' : 'en', ownedItemIds: ['shirt-mint'] });
  await openRewards(page, vi);
  const panel = page.locator('.reward-panel');
  await expect(panel).not.toContainText(/%|Nút trên chỉ mở popup|This button only opens the popup|same independent probabilities/);
  await expect(panel.locator('.reward-no-prize-odds')).toHaveCount(0);
  await page.getByRole('button', { name: vi ? 'Xem phần thưởng' : 'View rewards', exact: true }).click();
  const catalogue = page.getByRole('dialog');
  await expect(catalogue).not.toContainText(/%|tỉ lệ|odds/);
  await expect(catalogue.locator('.cosmetic-title-trigger, .reward-prize-odds')).toHaveCount(0);
  await catalogue.locator('.reward-rarity-tabs').getByRole('button', { name: vi ? 'Thông thường' : 'Common', exact: true }).click();
  await expect(catalogue).toContainText(vi ? 'Đã sở hữu · +1 bản dư khi trùng' : 'Owned · +1 spare when duplicated');
  await expect(catalogue).not.toContainText(/\+5|Duplicates give 5|Đồ trùng cho 5/);
  await catalogue.locator('.reward-rarity-tabs').getByRole('button', { name: vi ? 'Đặc biệt' : 'Special', exact: true }).click();
  await expect(catalogue.locator('.reward-prize-odds')).toHaveCount(0);
  await catalogue.locator('.reward-rarity-tabs').getByRole('button', { name: vi ? 'Huyền thoại' : 'Legendary', exact: true }).click();
  await catalogue.locator('.reward-secret-notice summary').click();
  await expect(catalogue).not.toContainText(/%|tỉ lệ|odds/);
  await expect(catalogue).toContainText(vi ? 'Nhận qua quay hoặc ghép đồ' : 'Draw or fusion reward');
  await expect(catalogue).not.toContainText(/Comet crown|Mũ sao chổi/);
  await page.screenshot({ path: info.outputPath(vi ? 'catalogue-vi.png' : 'catalogue-en.png') });
});
test('spare collection remains paginated and selected copies survive page changes without overflow', async ({ page }, info) => {
  const owned = COSMETICS.filter((item) => !item.starter && !item.secret);
  await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: owned.map((item) => item.id), duplicateItemCounts: Object.fromEntries(owned.map((item) => [item.id, 2])) });
  await openRewards(page);
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Recycle Mint shirt', exact: true }).click();
  const panel = page.locator('.duplicate-workshop');
  await expect(panel.locator('.character-item')).toHaveCount(6);
  const firstId = await panel.locator('.character-item').first().getAttribute('data-item-id');
  await panel.locator('.character-item select').first().selectOption('2');
  const navigation = panel.getByRole('navigation', { name: 'Spare copies pagination' });
  await navigation.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Recycle 2 spare copies', exact: true })).toBeEnabled();
  await navigation.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(panel.locator(`.character-item[data-item-id="${firstId}"] select`)).toHaveValue('2');
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
