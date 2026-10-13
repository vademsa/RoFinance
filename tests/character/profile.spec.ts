import { test, expect } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

async function openProfile(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Character profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'River', exact: true })).toBeVisible();
  // Allow the existing app's 400 ms initial financial normalization/autosave and
  // companion refresh to settle before measuring character-only side effects.
  await page.waitForTimeout(1200);
}

test('owned outfit only, all slots, base character and exchange without financial mutations', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', fragments: 20 });
  await openProfile(page);
  const writesBefore = fixture.writes();
  const financeBefore = structuredClone(fixture.finance());
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Rose shirt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save outfit' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset preview' }).click();
  await page.getByRole('button', { name: 'River', exact: true }).click();
  await page.getByRole('button', { name: 'Save outfit' }).click();
  await expect.poll(() => fixture.state().characterId).toBe('river');
  for (const [slot, itemName] of [['Shoes', 'shoes'], ['Hair', 'hair'], ['Faces', 'face'], ['Expressions', 'expression'], ['Backpacks', 'backpack'], ['Hats', 'hat']]) {
    await page.getByRole('button', { name: slot, exact: true }).click();
    await expect(page.getByRole('button', { name: `Preview Basic ${itemName}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Remove accessory' }).click();
  await page.getByRole('button', { name: 'Save outfit' }).click();
  await expect.poll(() => fixture.state().equipped.hat).toBeNull();
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const goldHat = page.locator('article.reward-prize').filter({ has: page.getByRole('heading', { name: 'Starlight hat', exact: true }) });
  await goldHat.getByRole('button', { name: /Exchange/ }).click();
  await expect.poll(() => fixture.state().fragments).toBe(0);
  await goldHat.getByRole('button', { name: 'Try on', exact: true }).click();
  await page.getByRole('button', { name: 'Save outfit' }).click();
  await expect.poll(() => fixture.state().equipped.hat).toBe('hat-gold');
  expect(fixture.finance().monthlyIncome).toBe(10000000);
  expect(fixture.finance().transactions).toHaveLength(1);
  expect(fixture.writes()).toBe(writesBefore);
  expect(fixture.finance()).toEqual(financeBefore);
  expect(await page.locator('.character-profile').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('profile.png'), fullPage: true });
});

test('retry after committed draw spends once; pending action survives tab navigation and opt-out', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: true });
  await openProfile(page);
  const writesBefore = fixture.writes();
  const financeBefore = structuredClone(fixture.finance());
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close draw result', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Privacy', exact: true }).click();
  await page.getByLabel('Public alias', { exact: true }).fill('Pixel Test');
  await page.getByRole('button', { name: 'Save privacy preferences' }).click();
  await expect.poll(() => fixture.state().nickname).toBe('Pixel Test');
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.drawRequests).toHaveLength(2);
  expect(fixture.drawRequests[0]).toBe(fixture.drawRequests[1]);
  expect(fixture.state().drawCount).toBe(1);
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.writes()).toBe(writesBefore);
  expect(fixture.finance()).toEqual(financeBefore);
});

test('privacy is opt-in and private alias separate', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await openProfile(page);
  await page.getByRole('button', { name: 'Privacy', exact: true }).click();
  await expect(page.getByLabel('Public alias', { exact: true })).toHaveValue('Companion');
  const participation = page.getByRole('checkbox', { name: /Join the character leaderboard/ });
  await expect(participation).not.toBeChecked();
  await page.getByLabel('Public alias', { exact: true }).fill('Pixel Test');
  await participation.check();
  await page.getByRole('button', { name: 'Save privacy preferences' }).click();
  await expect.poll(() => fixture.state().optIn).toBe(true);
  await participation.uncheck();
  await page.getByRole('button', { name: 'Save privacy preferences' }).click();
  await expect.poll(() => fixture.state().optIn).toBe(false);
  await page.screenshot({ path: test.info().outputPath('privacy.png'), fullPage: true });
  expect(await page.locator('.character-profile input[type=text], .character-profile input:not([type])').first().evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
});

for (const malformed of [false, true]) test(`reload confirms same committed draw after ${malformed ? 'malformed success' : 'lost response'}`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: !malformed, malformedDrawAfterCommit: malformed });
  await openProfile(page);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.drawRequests).toHaveLength(2);
  expect(fixture.drawRequests[0]).toBe(fixture.drawRequests[1]);
  expect(fixture.state().drawCount).toBe(1);
  expect(fixture.state().spentPoints).toBe(20);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('rofinance-character-pending')).length)).toBe(0);
});

test('another tab cannot erase a committed uncertain draw receipt', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: true });
  await openProfile(page);
  const second = await page.context().newPage();
  await openProfile(second);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await second.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeVisible();
  await startDraw(second);
  await expect.poll(() => fixture.state().drawCount).toBe(2);
  await second.close();
  await page.reload();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.drawRequests).toHaveLength(3);
  expect(fixture.drawRequests[2]).toBe(fixture.drawRequests[0]);
  expect(fixture.state().drawCount).toBe(2);
  expect(fixture.state().spentPoints).toBe(40);
});

test('reload confirms fragment exchange even though returned item is already owned', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', fragments: 20, failExchangeAfterCommit: true });
  await openProfile(page);
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const item = page.locator('article.reward-prize').filter({ has: page.getByRole('heading', { name: 'Rose shirt', exact: true }) });
  await item.getByRole('button', { name: /Exchange/ }).click();
  await expect(page.getByRole('dialog')).toContainText('could not be reached');
  await page.getByRole('button', { name: 'Close rewards', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.exchangeRequests).toHaveLength(2);
  expect(fixture.exchangeRequests[0]).toBe(fixture.exchangeRequests[1]);
  expect(fixture.state().fragments).toBe(0);
  expect(fixture.state().ownedItemIds.filter((id) => id === 'shirt-rose')).toHaveLength(1);
});

test('switches English/Vietnamese, light/dark and narrow header without corrupting feature labels', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light' });
  await openProfile(page);
  await page.getByRole('button', { name: 'Display Settings', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^(Vietnamese|Tiếng Việt)$/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Hồ sơ nhân vật', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tủ đồ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cài đặt hiển thị', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Character profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click();
  const colors = await page.locator('.character-button-primary').first().evaluate((button) => ({ color: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor }));
  expect(colors.color).toBe('rgb(255, 255, 255)');
  expect(colors.background).not.toBe(colors.color);
  for (const width of [320, 360, 375, 414, 768, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    const header = await page.locator('header').evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth,
      overflow: [...element.querySelectorAll('*')].map((child) => ({ text: child.textContent?.slice(0, 70), right: child.getBoundingClientRect().right })).filter((child) => child.right > innerWidth) }));
    expect(header.scroll <= header.width, JSON.stringify({ viewport: width, header })).toBe(true);
    expect(await page.locator('.character-profile').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test('unavailable companion never blocks finance; Vietnamese profile is explicitly localized', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', offline: true, language: 'vi' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hồ sơ nhân vật', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hồ sơ nhân vật' })).toBeVisible();
  await expect(page.getByText('Hồ sơ nhân vật chưa sẵn sàng.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page.locator('.character-companion')).toBeVisible();
});
