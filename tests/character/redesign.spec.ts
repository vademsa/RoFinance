import { expect, test } from '@playwright/test';
import { characterFixture } from './fixture';

test('opening and cancelling a draw never spends points or creates a receipt; starting inside is required', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.waitForTimeout(1200);
  const finances = structuredClone(fixture.finance()); const writes = fixture.writes();
  const before = structuredClone(fixture.state());
  const trigger = page.getByRole('button', { name: /Draw an item/ });
  await expect(page.locator('.reward-pity')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /animation/ })).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Reward draw', exact: true });
  await expect(dialog.locator('.reward-draw-ready')).toBeVisible();
  await expect(dialog.locator('.reward-reel-track')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Start draw/ })).toBeEnabled();
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.state()).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('rofinance-character-pending')))).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.state()).toEqual(before);
  expect(fixture.finance()).toEqual(finances);
  expect(fixture.writes()).toBe(writes);
});

test('compact reward cards show rarity-coloured cosmetic titles; legendary equipped scenery stays behind the character', async ({ page }, info) => {
  const phone = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: phone, ownedItemIds: ['shirt-phoenix', 'shirt-celestial', 'shirt-eclipse'] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.waitForTimeout(1200);
  const finances = structuredClone(fixture.finance()); const writes = fixture.writes();
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reward catalogue' });
  for (const [filter, colour, title] of [
    ['Rare', 'rgb(192, 132, 252)', 'Rose signature'],
    ['Special', 'rgb(252, 211, 77)', 'Starlight bearer'],
    ['Legendary', 'rgb(226, 232, 240)', 'Celestial wayfarer'],
  ]) {
    await dialog.getByRole('button', { name: filter, exact: true }).click();
    const card = dialog.locator('.reward-prize').first();
    await expect(card).toBeVisible();
    if (phone) await card.locator('h3').tap();
    else await card.hover();
    const tooltip = card.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('.cosmetic-honour')).toHaveText(title);
    await expect(tooltip.locator('.cosmetic-honour')).toHaveCSS('color', colour);
    await expect(tooltip).toContainText('No ranking bonus');
    expect((await card.boundingBox())!.height).toBeLessThan(300);
    const bounds = await tooltip.boundingBox(); const cardBounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(cardBounds!.x + cardBounds!.width);
    await expect(card.locator('.cosmetic-title-trigger')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`compact-${filter.split(' ')[0]}.png`) });
  }
  await dialog.getByRole('button', { name: 'Close rewards' }).click();
  await page.getByRole('button', { name: 'Shirts', exact: true }).click();
  for (const [name, theme] of [['Phoenix shirt', 'phoenix'], ['Celestial shirt', 'celestial'], ['Eclipse coat', 'eclipse']]) {
    const card = page.locator('.character-item').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await card.getByRole('button', { name: `Preview ${name}`, exact: true }).click();
    const stage = page.locator('.character-stage');
    await expect(stage).toHaveAttribute('data-theme', theme);
    const background = stage.locator('.cosmetic-backdrop');
    await expect(background).toHaveCSS('position', 'absolute');
    await expect(background).toHaveAttribute('data-theme', theme);
    expect((await stage.boundingBox())!.height).toBeLessThanOrEqual(240);
    await expect(stage.getByRole('img', { name: 'Character preview' })).toBeVisible();
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`equipped-${theme}.png`) });
  }
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.state().equipped.shirt).toBe('shirt-basic');
  expect(fixture.finance()).toEqual(finances);
  expect(fixture.writes()).toBe(writes);
});
