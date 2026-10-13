import { test, expect } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

for (const entry of [
  { roll: 1300000, index: 0, aura: 'neutral', name: 'Mint shirt' },
  { roll: 1895000, index: 0, aura: 'purple', name: 'Rose shirt' },
  { roll: 1996500, index: 0, aura: 'gold', name: 'Starlight shirt' },
  { roll: 1999965, index: 3, aura: 'platinum', name: 'Celestial shirt' },
  { roll: 1999965, index: 0, aura: 'rainbow', name: 'Comet crown' },
  { roll: 0, index: 0, aura: null, name: 'No item won' },
]) test(`draw popup appears only on demand, reveals ${entry.aura || 'empty'} result and dismisses without another debit`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: entry.roll, drawItemIndex: entry.index });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.locator('.reward-reel-track')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const finances = structuredClone(fixture.finance());
  const writes = fixture.writes();
  const trigger = page.getByRole('button', { name: /Draw an item/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Reward draw', exact: true });
  await expect(dialog.locator('.reward-draw-ready')).toBeVisible();
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.state().spentPoints).toBe(0);
  await dialog.getByRole('button', { name: /^Start draw/ }).click();
  await expect(dialog.locator('.reward-result')).toContainText(entry.name);
  const art = dialog.locator('.reward-result .cosmetic-artwork');
  if (entry.aura) {
    await expect(art).toHaveAttribute('data-aura', entry.aura);
    await expect(dialog.getByRole('img', { name: entry.name, exact: true })).toBeVisible();
    expect(await art.locator('.cosmetic-aura-rays').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  } else await expect(art).toHaveCount(0);
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.locator('footer')).toBeInViewport();
  }
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: 812 });
  await dialog.locator('.reward-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`result-${entry.aura || 'empty'}.png`) });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.reward-reel-track')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.drawRequests).toHaveLength(1);
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.finance()).toEqual(finances);
  expect(fixture.writes()).toBe(writes);
});

test.describe('animated aura', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('purple, gold and platinum auras rotate, reduced motion stops effects; spin cannot be dismissed prematurely', async ({ page }, info) => {
    test.setTimeout(60000);
    await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 1999965, drawItemIndex: 0 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Character profile', exact: true }).click();
    await page.getByRole('button', { name: 'View rewards', exact: true }).click();
    const catalogue = page.getByRole('dialog');
    for (const aura of ['purple', 'gold', 'platinum']) {
      if (aura === 'platinum') await catalogue.getByRole('button', { name: 'Legendary', exact: true }).click();
      const rays = catalogue.locator(`[data-aura="${aura}"] .cosmetic-aura-rays`).first();
      await catalogue.locator(`[data-aura="${aura}"]`).first().scrollIntoViewIfNeeded();
      expect(await rays.evaluate((el) => getComputedStyle(el).animationName)).toBe('cosmetic-aura-turn');
      const start = await rays.evaluate((el) => getComputedStyle(el).transform);
      await expect.poll(() => rays.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
    }
    await page.getByRole('button', { name: 'Close rewards' }).click();
    await page.getByRole('button', { name: 'Rewards', exact: true }).click();
    await startDraw(page);
    const dialog = page.getByRole('dialog', { name: 'Reward draw', exact: true });
    await expect(dialog.getByRole('button', { name: 'Close draw result' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.reward-result')).toContainText('Comet crown', { timeout: 30000 });
    const rays = dialog.locator('.reward-result [data-aura="rainbow"] .cosmetic-aura-rays');
    await dialog.locator('.reward-result').scrollIntoViewIfNeeded();
    expect(await rays.evaluate((el) => getComputedStyle(el).animationName)).toBe('cosmetic-aura-turn');
    const start = await rays.evaluate((el) => getComputedStyle(el).transform);
    await expect.poll(() => rays.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await rays.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Close draw result' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
