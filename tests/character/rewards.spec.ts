import { test, expect, type Page } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

async function rewards(page: Page, language: 'vi' | 'en' = 'en') {
  await page.goto('/');
  await page.getByRole('button', { name: language === 'en' ? 'Character profile' : 'Hồ sơ nhân vật', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: language === 'en' ? 'Rewards' : 'Quay thưởng', exact: true }).click();
}

test('catalogue previews public prizes without odds and keeps undiscovered names hidden', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light' });
  await rewards(page);
  await expect(page.locator('.reward-prize')).toHaveCount(0);
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const catalogue = page.locator('.reward-catalogue');
  await catalogue.getByRole('button', { name: 'Common', exact: true }).click();
  await expect(catalogue.getByRole('button', { name: 'Common', exact: true })).toBeVisible();
  await expect(catalogue.getByRole('button', { name: 'Rare', exact: true })).toBeVisible();
  await expect(catalogue.getByRole('button', { name: 'Special', exact: true })).toBeVisible();
  await expect(page.locator('.reward-secret-notice')).toContainText('7 secret items');
  await expect(page.locator('.reward-prize')).toHaveCount(6);
  await expect(page.getByRole('navigation', { name: 'Reward catalogue pagination' })).toContainText('/ 35 items');
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await expect(catalogue).not.toContainText('%');
  await catalogue.getByRole('button', { name: 'Rare', exact: true }).click();
  await expect(page.locator('.reward-prize')).toHaveCount(6);
  await expect(page.getByRole('navigation', { name: 'Reward catalogue pagination' })).toContainText('/ 28 items');
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await catalogue.getByRole('button', { name: 'Special', exact: true }).click();
  await expect(page.locator('.reward-prize')).toHaveCount(6);
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await catalogue.getByRole('button', { name: 'Legendary', exact: true }).click();
  await expect(page.locator('.reward-prize')).toHaveCount(6);
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await catalogue.getByLabel('Filter item category', { exact: true }).selectOption('hat');
  await expect(page.locator('.reward-prize')).toHaveCount(2);
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await expect(catalogue).not.toContainText(/Comet crown|Aurora jacket|Orbital backpack|Singularity crown|Dragon pack|Astral expression|Eclipse coat|Basic shirt/);
  await page.getByRole('button', { name: 'Close rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Wardrobe', exact: true }).click();
  for (const slot of ['Shirts', 'Hats', 'Backpacks']) {
    await page.locator('.character-slots').getByRole('button', { name: slot, exact: true }).click();
    await expect(page.locator('.character-item-grid')).not.toContainText(/Comet crown|Aurora jacket|Orbital backpack|Singularity crown|Dragon pack|Eclipse coat/);
    await expect(page.locator('.character-item')).toHaveCount(1);
  }
});

test('legacy insurance counters no longer change odds or guarantee a prize', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', pityCount: 9, drawRoll: 0 });
  await rewards(page);
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  await expect(page.locator('.reward-rarity-tabs').getByRole('button', { name: 'Common', exact: true })).toBeVisible();
  await page.locator('.reward-rarity-tabs').getByRole('button', { name: 'Rare', exact: true }).click();
  await expect(page.locator('.reward-prize-odds')).toHaveCount(0);
  await expect(page.locator('.reward-rarity-tabs').getByRole('button', { name: 'Legendary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close rewards', exact: true }).click();
  await startDraw(page);
  await expect(page.locator('.reward-result')).toContainText('No item won');
  await expect(page.locator('.reward-reel-caption')).toHaveCount(0);
  await expect(page.locator('.reward-pity')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close draw result' }).click();
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  await expect(page.locator('.reward-rarity-tabs').getByRole('button', { name: 'Rare', exact: true })).toBeVisible();
});

test('winning a secret reveals it, permits equipping it and preserves financial data', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 1999965, drawItemIndex: 0 });
  await rewards(page);
  const finance = structuredClone(fixture.finance());
  const writes = fixture.writes();
  await startDraw(page);
  await expect(page.locator('.reward-result')).toContainText('SECRET ITEM DISCOVERED');
  await expect(page.locator('.reward-result')).toContainText('Comet crown');
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.state().equipped.hat).toBe('hat-basic');
  await page.getByRole('button', { name: 'View in wardrobe' }).click();
  const item = page.locator('.character-item').filter({ has: page.getByRole('heading', { name: 'Comet crown', exact: true }) });
  await expect(item).toContainText('Secret discovered');
  await expect(item.getByRole('button', { name: /Exchange/ })).toHaveCount(0);
  await item.getByRole('button', { name: 'Try on', exact: true }).click();
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped.hat).toBe('hat-comet');
  expect(fixture.writes()).toBe(writes);
  expect(fixture.finance()).toEqual(finance);
});

test('public legendary items cannot be exchanged even with fragments, but a confirmed win can be equipped', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', fragments: 100, drawRoll: 1999965, drawItemIndex: 3 });
  await rewards(page);
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Legendary', exact: true }).click();
  await page.getByLabel('Filter item category', { exact: true }).selectOption('shirt');
  const item = page.locator('.reward-prize').filter({ has: page.getByRole('heading', { name: 'Celestial shirt', exact: true }) });
  await expect(item).toContainText('Draw or fusion reward');
  await expect(item.getByRole('button', { name: /Exchange/ })).toHaveCount(0);
  await item.getByRole('button', { name: 'Preview Celestial shirt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save outfit', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  await expect(page.locator('.reward-result')).toContainText('Celestial shirt');
  await expect(page.locator('.reward-result')).toContainText('Legendary');
  await page.getByRole('button', { name: 'View in wardrobe' }).click();
  const owned = page.locator('.character-item').filter({ has: page.getByRole('heading', { name: 'Celestial shirt', exact: true }) });
  await owned.getByRole('button', { name: /^(Try on|Previewing)$/ }).click();
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped.shirt).toBe('shirt-celestial');
  expect(fixture.state().fragments).toBe(100);
  expect(fixture.exchangeRequests).toHaveLength(0);
});

test('background refresh does not block confirmation or restore a stale pending action', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: true });
  await rewards(page);
  await startDraw(page);
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close draw result', exact: true }).click();
  fixture.delayProfiles(1500);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.locator('.reward-result')).toContainText('Rose shirt');
  await page.waitForTimeout(1700);
  await expect(page.getByRole('button', { name: 'Confirm again', exact: true })).toHaveCount(0);
  expect(fixture.drawRequests).toHaveLength(2);
  expect(fixture.drawRequests[0]).toBe(fixture.drawRequests[1]);
  expect(fixture.state().spentPoints).toBe(20);
});

test('Vietnamese catalogue works in both themes at narrow sizes and honours reduced motion', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', language: 'vi', drawDelayMs: 500 });
  await rewards(page, 'vi');
  await page.getByRole('button', { name: 'Xem phần thưởng', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Danh sách phần thưởng');
  await expect(page.locator('.reward-secret-notice')).toContainText('7 vật phẩm bí mật · 0,000333%');
  await page.setViewportSize({ width: 320, height: 812 });
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Đóng phần thưởng', exact: true }).click();
  expect(await page.locator('.character-profile').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.reward-machine').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('rewards-vi-320.png') });
  await startDraw(page, 'vi');
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'opening');
  expect(await page.locator('.reward-reel-track').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await expect(page.locator('.reward-result')).toContainText('Áo');
});

test.describe('full motion', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('opening stays animated until confirmed and blocks an extra debit while revealing', async ({ page }, info) => {
    const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawDelayMs: 200 });
    await rewards(page);
    // Attack the exact UI commit after confirmation, not a wall-clock delay:
    // slow test runners can otherwise click after the reveal legitimately ends.
    await page.evaluate(() => {
      const host = window as typeof window & { guardedDrawPhase?: string };
      const panel = document.querySelector('.reward-panel')!;
      const observer = new MutationObserver(() => {
        if (panel.querySelector('.character-stat strong')?.textContent !== '20') return;
        observer.disconnect();
        host.guardedDrawPhase = document.querySelector('.reward-stage')?.getAttribute('data-phase') || '';
        if (host.guardedDrawPhase !== 'opening') return;
        const button = panel.querySelector<HTMLButtonElement>('.reward-draw-button')!;
        button.disabled = false; button.click(); button.disabled = true;
      });
      observer.observe(panel, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await startDraw(page);
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'opening');
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Spinning…', exact: true })).toBeDisabled();
    await expect(page.locator('.reward-result')).toHaveCount(0);
    await expect(page.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
    await expect(page.locator('.reward-reel-track')).toHaveAttribute('data-duration-ms', '10000');
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed', { timeout: 30000 });
    await expect(page.locator('.reward-result')).toContainText('Rose shirt');
    expect(await page.evaluate(() => (window as typeof window & { guardedDrawPhase?: string }).guardedDrawPhase)).toBe('opening');
    expect(fixture.drawRequests).toHaveLength(1);
    expect(fixture.state().spentPoints).toBe(20);
  });
  test('lost confirmation stops opening without inventing a prize; retry uses the original receipt', async ({ page }, info) => {
    const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommit: true, drawDelayMs: 200 });
    await rewards(page);
    await startDraw(page);
    await expect(page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ })).toBeEnabled();
    await expect(page.locator('.reward-stage')).toHaveCount(0);
    await expect(page.locator('.reward-result')).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed', { timeout: 30000 });
    await expect(page.locator('.reward-result')).toContainText('Rose shirt');
    expect(fixture.drawRequests).toHaveLength(2);
    expect(fixture.drawRequests[0]).toBe(fixture.drawRequests[1]);
    expect(fixture.state().spentPoints).toBe(20);
  });
});
