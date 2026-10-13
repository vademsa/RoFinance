import { test, expect } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

test('profile cards and cycle selector stay compact across tabs and viewport sizes', async ({ page }, info) => {
  // This regression intentionally exercises 15 tab/viewport combinations.
  test.setTimeout(60000);
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', bonusPoints: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'River', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  const finances = structuredClone(fixture.finance());
  const writes = fixture.writes();
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['Wardrobe', 'Rewards', 'Privacy']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const dimensions = await page.locator('.character-layout').evaluate((layout) => {
        const aside = layout.querySelector('aside')!;
        const cards = [...aside.children].map((card) => card.getBoundingClientRect().height);
        const select = aside.querySelector('select')!.getBoundingClientRect();
        const panel = aside.querySelector('.character-stage')!.getBoundingClientRect();
        return { cards, selector: select.height, stage: panel.height, aside: aside.getBoundingClientRect().height,
          gap: aside.children[1].getBoundingClientRect().top - aside.children[0].getBoundingClientRect().bottom };
      });
      expect(dimensions.cards[0]).toBeLessThan(650);
      expect(dimensions.cards[1]).toBeLessThan(750);
      expect(dimensions.selector).toBeGreaterThanOrEqual(44);
      expect(dimensions.selector).toBeLessThan(70);
      expect(dimensions.stage).toBeLessThanOrEqual(240);
      expect(dimensions.gap).toBe(16);
      expect(await page.locator('.character-profile').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (tab === 'Rewards') {
        await expect(page.getByText('This account has received 1000 test draw points.', { exact: false })).toBeVisible();
        expect(await page.locator('.character-stat').evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth))).toBe(true);
      }
    }
  }
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  await expect.poll(() => fixture.state().drawCount).toBe(1);
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.state().bonusPoints).toBe(1000);
  expect(fixture.state().awards).toEqual({});
  expect(fixture.finance()).toEqual(finances);
  expect(fixture.writes()).toBe(writes);
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed', { timeout: 30000 });
  await page.getByRole('button', { name: 'Close draw result' }).click();
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: 900 });
  await page.getByRole('button', { name: 'Wardrobe', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('profile-layout-fixed.png'), fullPage: true });
});
