import { expect, test, type Page } from '@playwright/test';
import { characterFixture, startDraw } from './fixture';

async function openRewards(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  // Let the existing app startup normalization/autosave settle before measuring
  // finance writes attributable to character actions.
  await page.waitForTimeout(1200);
}
const resultDialog = (page: Page) => page.getByRole('dialog', { name: 'Reward draw', exact: true });
const again = (page: Page) => resultDialog(page).getByRole('button', { name: /^(Draw again|Start draw)/ });
async function assertUnclippedReel(page: Page) {
  const bounds = await resultDialog(page).locator('.reward-reel-viewport').evaluate((el) => {
    const viewport = el.getBoundingClientRect();
    const card = el.querySelector('.reward-reel-card')!.getBoundingClientRect();
    return { height: viewport.height, fits: card.top >= viewport.top && card.bottom <= viewport.bottom };
  });
  expect(bounds.height).toBeCloseTo(166, 0);
  expect(bounds.fits).toBe(true);
}

for (const empty of [false, true]) test(`repeat ${empty ? 'empty' : 'winning'} draws stay in one popup, reset the reel and grey out at zero`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: empty ? 0 : 1895000 });
  await openRewards(page);
  const writes = fixture.writes();
  const finances = structuredClone(fixture.finance());
  await startDraw(page);
  const dialog = resultDialog(page);
  await expect(dialog.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await assertUnclippedReel(page);
  await expect(dialog.locator('.reward-result')).toContainText(empty ? 'No item won' : 'Rose shirt');
  const firstStrip = await dialog.locator('.reward-reel-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-item-id')));
  await expect(again(page)).toBeEnabled();
  await expect(again(page)).toBeFocused();
  await expect(dialog.locator('.reward-draw-options')).toContainText('Draws remaining: 1');
  await dialog.evaluate((el) => { el.dataset.repeatIdentity = 'same'; });
  await dialog.locator('.reward-reel-track').evaluate((el) => { (el as HTMLElement).dataset.oldTrack = 'true'; });
  await dialog.locator('.character-catalogue-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const started = await page.evaluate(() => performance.now());
  await again(page).click();
  await expect(dialog).toHaveAttribute('data-repeat-identity', 'same');
  await expect(dialog.locator('.reward-stage')).toHaveAttribute('data-phase', 'opening');
  await expect(dialog.locator('.reward-result')).toHaveCount(0);
  await expect(dialog.locator('.reward-reel-track')).not.toHaveAttribute('data-old-track', 'true');
  expect(await dialog.locator('.character-catalogue-body').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(dialog.locator('.reward-reel-viewport')).toBeInViewport();
  await assertUnclippedReel(page);
  await expect(dialog.getByRole('button', { name: 'Spinning…', exact: true })).toBeDisabled();
  await expect(dialog.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
  expect(await dialog.locator('.reward-reel-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-item-id')))).not.toEqual(firstStrip);
  await expect(dialog.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await assertUnclippedReel(page);
  expect(await page.evaluate(() => performance.now()) - started).toBeGreaterThanOrEqual(10000);
  await expect(again(page)).toBeDisabled();
  await expect(again(page)).toHaveCSS('background-color', 'rgb(82, 82, 91)');
  await expect(dialog.locator('.reward-draw-options')).toContainText('Draws remaining: 0');
  // Force-enable the DOM button: the application guard still prevents a request.
  await again(page).evaluate((el) => { const b = el as HTMLButtonElement; b.disabled = false; b.click(); b.disabled = true; });
  expect(fixture.drawRequests).toHaveLength(2);
  expect(new Set(fixture.drawRequests).size).toBe(2);
  expect(fixture.state().spentPoints).toBe(40);
  expect(fixture.state().drawCount).toBe(2);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.finance()).toEqual(finances);
  for (const viewport of [{ width: 320, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    await assertUnclippedReel(page);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.locator('footer')).toBeInViewport();
    await expect(again(page)).toBeInViewport();
  }
  await page.setViewportSize({ width: info.project.name === 'phone-light' ? 375 : 1280, height: 812 });
  await page.screenshot({ path: info.outputPath('repeat-exhausted.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rewards', exact: true })).toBeFocused();
});

test('another device exhausts stale points: backend rejects and the same popup refreshes to zero', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await openRewards(page);
  const writes = fixture.writes();
  const finances = structuredClone(fixture.finance());
  await startDraw(page);
  await expect(resultDialog(page).locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  fixture.spendPointsElsewhere();
  const state = structuredClone(fixture.state());
  await expect(again(page)).toBeEnabled();
  const rejection = page.waitForResponse((r) => r.url().endsWith('/api/character/draw') && r.status() === 409);
  await again(page).click();
  expect((await (await rejection).json()).error).toBe('NOT_ENOUGH_POINTS');
  await expect(resultDialog(page)).toBeVisible();
  await expect(resultDialog(page).locator('.reward-draw-options')).toContainText('Draws remaining: 0');
  await expect(again(page)).toBeDisabled();
  await expect(resultDialog(page).locator('.reward-result')).toHaveCount(0);
  await expect(resultDialog(page)).not.toContainText('Your result has been confirmed');
  expect(fixture.state()).toEqual(state);
  expect(fixture.drawRequests).toHaveLength(2);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.finance()).toEqual(finances);
});

test('a lost response on draw two stays in the popup and confirms the same receipt at zero backend points', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', failDrawAfterCommitAt: 2 });
  await openRewards(page);
  const writes = fixture.writes();
  const finances = structuredClone(fixture.finance());
  await startDraw(page);
  await expect(resultDialog(page).locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await again(page).click();
  const retry = resultDialog(page).getByRole('button', { name: /Confirm draw again/ });
  await expect(retry).toBeEnabled();
  await expect(retry).toBeFocused();
  await expect(resultDialog(page)).toContainText('This draw is awaiting confirmation');
  await expect(resultDialog(page).locator('.reward-result')).toHaveCount(0);
  expect(fixture.state().spentPoints).toBe(40);
  await retry.click();
  await expect(resultDialog(page).locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed');
  await expect(resultDialog(page).locator('.reward-result')).toContainText('DUPLICATE ITEM RECEIVED');
  await expect(again(page)).toBeDisabled();
  expect(fixture.drawRequests).toHaveLength(3);
  expect(fixture.drawRequests[0]).not.toBe(fixture.drawRequests[1]);
  expect(fixture.drawRequests[1]).toBe(fixture.drawRequests[2]);
  expect(fixture.state().spentPoints).toBe(40);
  expect(fixture.state().drawCount).toBe(2);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.finance()).toEqual(finances);
});

test('item travel is automatic without animation checkboxes, including on a reduced-motion device', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRewards(page);
  await expect(page.getByRole('checkbox', { name: /Show.*animation/ })).toHaveCount(0);
  const started = await page.evaluate(() => performance.now());
  await startDraw(page);
  const dialog = resultDialog(page);
  await expect(dialog.locator('.reward-stage')).toHaveAttribute('data-motion', 'full');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  const track = dialog.locator('.reward-reel-track');
  await expect(track).toHaveAttribute('data-settling', 'true');
  const transform = await track.evaluate((el) => getComputedStyle(el).transform);
  const active = await track.locator('[data-active="true"]').getAttribute('data-item-id');
  await expect.poll(() => track.evaluate((el) => getComputedStyle(el).transform)).not.toBe(transform);
  await expect.poll(() => track.locator('[data-active="true"]').getAttribute('data-item-id')).not.toBe(active);
  await expect(dialog.locator('.reward-result')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('explicit-motion.png') });
  await expect(dialog.locator('.reward-stage')).toHaveAttribute('data-phase', 'revealed', { timeout: 30000 });
  expect(await page.evaluate(() => performance.now()) - started).toBeGreaterThanOrEqual(10000);
  await expect(dialog.locator('.reward-result')).toContainText('Rose shirt');
  expect(fixture.drawRequests).toHaveLength(1);
});
