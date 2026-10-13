import { test, expect, type Page } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';
import { REEL_LANDING_INDEX, REEL_START_INDEX } from '../../src/utils/rewardReel';

type MotionWindow = Window & { motionSample?: Promise<{ start: string; moved: string; elapsed: number; indices: number[]; early: boolean }> };

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.locator('.character-character-picker')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
}
async function assertLanding(page: Page, itemId: string) {
  const landing = page.locator('.reward-reel-card[data-landing="true"]');
  await expect(landing).toHaveAttribute('data-item-id', itemId);
  const difference = await page.locator('.reward-reel-viewport').evaluate((viewport) => {
    const card = viewport.querySelector('[data-landing="true"]')!.getBoundingClientRect();
    const marker = viewport.querySelector('.reward-reel-marker')!.getBoundingClientRect();
    return Math.abs(card.left + card.width / 2 - marker.left - marker.width / 2);
  });
  expect(difference).toBeLessThan(1);
}

for (const empty of [false, true]) test(`reel centres the actual ${empty ? 'empty' : 'winning'} result at every screen size`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: empty ? 0 : 1895000 });
  await open(page);
  await expect(page.locator('.reward-stage')).toHaveCount(0);
  const before = structuredClone(fixture.state());
  const finance = structuredClone(fixture.finance());
  const writes = fixture.writes();
  const waitStarted = await page.evaluate(() => performance.now());
  await startDraw(page);
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'opening');
  await expect(page.locator('.reward-result')).toHaveCount(0);
  await expect(page.getByRole('progressbar', { name: 'Draw progress' })).toHaveCount(0);
  await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  // Even accessibility/reduced-motion mode must not instantly reveal a prize.
  expect(await page.evaluate(() => performance.now()) - waitStarted).toBeGreaterThanOrEqual(10000);
  await expect(page.locator('.reward-result')).toContainText(empty ? 'No item won' : 'Rose shirt');
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await assertLanding(page, empty ? 'none' : 'shirt-rose');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.state().drawCount).toBe(1);
  expect(fixture.drawRequests).toHaveLength(1);
  if (empty) {
    expect(fixture.state().ownedItemIds).toEqual(before.ownedItemIds);
    expect(fixture.state().fragments).toBe(before.fragments);
    expect(fixture.state().pityCount).toBe(0);
    expect(fixture.state().equipped).toEqual(before.equipped);
    await expect(page.getByRole('button', { name: 'View in wardrobe' })).toHaveCount(0);
  }
  expect(fixture.finance()).toEqual(finance);
  expect(fixture.writes()).toBe(writes);
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: 900 });
  await page.getByRole('dialog', { name: 'Reward draw', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(empty ? 'reel-empty.png' : 'reel-item.png') });
});

test('an uncertain empty draw survives reload and retries the same UUID without another debit', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 0, failDrawAfterCommit: true });
  await open(page);
  await startDraw(page);
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ })).toBeEnabled();
  await expect(page.locator('.reward-result')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm again', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Confirm draw again/ }).click();
  await expect(page.locator('.reward-result')).toContainText('No item won');
  await assertLanding(page, 'none');
  expect(fixture.drawRequests).toHaveLength(2);
  expect(fixture.drawRequests[0]).toBe(fixture.drawRequests[1]);
  expect(fixture.state().spentPoints).toBe(20);
  expect(fixture.state().ownedItemIds).toHaveLength(7);
});

test.describe('full motion', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('the reel moves, slows down and stops on an empty result without a fake prize', async ({ page }, info) => {
    const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 0 });
    await open(page);
    // Sample the entire actual strip in the page, not just its declared duration.
    await expect(page.locator('.reward-reel-track')).toHaveCount(0);
    await page.evaluate(() => {
      (window as MotionWindow).motionSample = new Promise((resolve, reject) => {
        const clickedAt = performance.now();
        let frame = 0;
        const timeout = window.setTimeout(() => { observer.disconnect(); cancelAnimationFrame(frame); reject(new Error('Reel transition did not finish')); }, 40000);
        const observer = new MutationObserver(() => {
          const element = document.querySelector('.reward-reel-track');
          if (!element) return;
          if (element.getAttribute('data-settling') !== 'true') return;
          observer.disconnect();
          const start = getComputedStyle(element).transform;
          let moved = start;
          let early = false;
          const initialIndex = Array.from(element.children).findIndex((card) => card.getAttribute('data-active') === 'true');
          const indices: number[] = initialIndex < 0 ? [] : [initialIndex];
          const sample = () => {
            const transform = getComputedStyle(element).transform;
            if (transform !== start) moved = transform;
            const index = Array.from(element.children).findIndex((card) => card.getAttribute('data-active') === 'true');
            if (index >= 0 && indices.at(-1) !== index) indices.push(index);
            const elapsed = performance.now() - clickedAt;
            if (document.querySelector('.reward-result') && elapsed < 10000) early = true;
            if (document.querySelector('.reward-stage')?.getAttribute('data-phase') === 'revealed') {
              window.clearTimeout(timeout); resolve({ start, moved, elapsed, indices, early });
            } else frame = requestAnimationFrame(sample);
          };
          frame = requestAnimationFrame(sample);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-settling'] });
      });
    });
    await startDraw(page);
    await expect(page.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
    await expect(page.locator('.reward-reel-track .cosmetic-backdrop, .reward-reel-track .cosmetic-aura')).toHaveCount(0);
    const stationary = await page.locator('.reward-reel-viewport').evaluate((element) => {
      const style = getComputedStyle(element), marker = element.querySelector('.reward-reel-marker')!;
      return { transform: style.transform, background: style.background, bounds: element.getBoundingClientRect().toJSON(), marker: marker.getBoundingClientRect().toJSON() };
    });
    const stripBefore = await page.locator('.reward-reel-track').evaluate((element) => getComputedStyle(element).transform);
    await expect.poll(() => page.locator('.reward-reel-track').evaluate((element) => getComputedStyle(element).transform)).not.toBe(stripBefore);
    expect(await page.locator('.reward-reel-viewport').evaluate((element) => {
      const style = getComputedStyle(element), marker = element.querySelector('.reward-reel-marker')!;
      return { transform: style.transform, background: style.background, bounds: element.getBoundingClientRect().toJSON(), marker: marker.getBoundingClientRect().toJSON() };
    })).toEqual(stationary);
    await expect(page.locator('.reward-result')).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Spinning…', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('reel-spinning.png') });
    const { start, moved, elapsed, indices, early } = await page.evaluate(() => (window as MotionWindow).motionSample!);
    expect(start).not.toBe(moved);
    expect(elapsed).toBeGreaterThanOrEqual(10000);
    expect(early).toBe(false);
    // Wall-clock catch-up must not prolong the draw when CI/OS drops frames.
    // Physical cards remain ordered; visible samples move forward, never reset.
    expect(indices[0]).toBe(REEL_START_INDEX);
    expect(indices.at(-1)).toBe(REEL_LANDING_INDEX);
    expect(indices.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < indices.length; i++) expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    console.log(`${info.project.name}: reel sampled ${indices.length} forward-moving cards; result after ${Math.round(elapsed)}ms`);
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed', { timeout: 15000 });
    await expect(page.locator('.reward-result')).toContainText('No item won');
    await assertLanding(page, 'none');
    expect(fixture.drawRequests).toHaveLength(1);
    expect(fixture.state().spentPoints).toBe(20);
  });
  test('reduced motion during a draw softens auxiliary effects without hiding the item reel', async ({ page }, info) => {
    const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
    await open(page);
    const started = await page.evaluate(() => performance.now());
    await startDraw(page);
    await expect(page.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.reward-stage .sr-only')).toContainText('Spinning');
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'opening');
    const transform = await page.locator('.reward-reel-track').evaluate((el) => getComputedStyle(el).transform);
    await expect.poll(() => page.locator('.reward-reel-track').evaluate((el) => getComputedStyle(el).transform)).not.toBe(transform);
    await expect(page.locator('.reward-result')).toHaveCount(0);
    await expect(page.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
    expect(await page.evaluate(() => performance.now()) - started).toBeGreaterThanOrEqual(10000);
    await assertLanding(page, 'shirt-rose');
    expect(fixture.drawRequests).toHaveLength(1);
    expect(fixture.state().spentPoints).toBe(20);
  });
});
