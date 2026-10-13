import { expect, test } from '@playwright/test';
import { COSMETICS, ITEM_SLOTS } from '../../shared/character';
import { OUTFIT_SETS } from '../../src/utils/outfitSets';
import { characterFixture } from './fixture';

test('complete owned sets preview, save and appear publicly; mismatching or removing one item stops only the full-set effect', async ({ page }, info) => {
  const sets = ['mint', 'celestial', 'phoenix'].map((id) => OUTFIT_SETS.find((set) => set.id === id)!);
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: sets.flatMap((set) => Object.values(set.items) as string[]) });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions[0].bankName).toBe('Tiền mặt');
  // Let the existing 400 ms startup autosave/character refresh settle before
  // attributing any requests to the outfit actions below.
  await page.waitForTimeout(1200);
  const before = structuredClone({ finance: fixture.finance(), owned: fixture.state().ownedItemIds, points: fixture.state().spentPoints, writes: fixture.writes() });
  const stage = page.locator('.character-stage');
  await expect(stage.locator('.full-set-effect')).toHaveCount(0);
  await page.locator('.character-set-details summary').click();
  await expect(page.locator('.character-set-details summary')).toContainText('3/16');
  await expect(page.getByRole('button', { name: 'Preview set Rose', exact: true })).toBeDisabled();
  for (const set of sets) {
    await page.getByRole('button', { name: `Preview set ${set.en}`, exact: true }).click();
    const effect = stage.locator('.full-set-effect');
    await expect(effect).toHaveAttribute('data-outfit-set', set.id);
    await expect(page.locator('.character-set-active')).toContainText(`${set.en} · Full set effect active`);
    await expect(effect).toHaveCSS('pointer-events', 'none');
    await expect(effect.locator('.full-set-particle-motion').first()).not.toHaveCSS('animation-name', 'none');
    const svg = (await stage.locator('.pixel-character').boundingBox())!;
    const fx = (await effect.boundingBox())!;
    expect(fx.width).toBeCloseTo(svg.width, 0);
    expect(fx.height).toBeCloseTo(svg.height, 0);
    await stage.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await stage.screenshot({ path: info.outputPath(`full-set-${set.id}.png`) });
    for (const slot of ITEM_SLOTS) await expect(stage.locator(`.pixel-character [data-slot="${slot}"]`)).toHaveCount(1);
    expect(fixture.state().equipped.shirt).toBe('shirt-basic'); // Preview is not an implicit save.
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const selector of ['.full-set-emblem', '.full-set-halo', '.full-set-particle-motion']) {
    await expect(stage.locator(selector).first()).toHaveCSS('animation-name', 'none');
  }
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped).toEqual(sets[2].items);
  await page.locator('.character-owned-collection').getByRole('button', { name: 'Hats', exact: true }).click();
  await page.getByRole('button', { name: 'Remove accessory', exact: true }).click();
  await expect(stage.locator('.full-set-effect')).toHaveCount(0);
  await expect(stage.locator('.equipped-slot-aura[data-slot="shirt"]')).toHaveCount(1);
  await expect(page.locator('.character-set-active')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset preview', exact: true }).click();
  await expect(stage.locator('.full-set-effect')).toHaveAttribute('data-outfit-set', 'phoenix');
  await page.getByRole('button', { name: 'Preview Basic hat', exact: true }).click();
  await expect(stage.locator('.full-set-effect')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset preview', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.character-companion-portrait .full-set-effect')).toHaveAttribute('data-outfit-set', 'phoenix');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('.character-ranking-portrait .full-set-effect')).toHaveCount(3);
  await expect(page.locator('.character-ranking-portrait [data-mood]').first()).toHaveAttribute('data-mood', 'steady');
  expect(fixture.finance()).toEqual(before.finance);
  expect(fixture.writes()).toBe(before.writes);
  expect(fixture.state().ownedItemIds).toEqual(before.owned);
  expect(fixture.state().spentPoints).toBe(before.points);
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.materialRequests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a missing piece keeps collection locked and full-set catalogue previews cannot activate or save it', async ({ page }, info) => {
  const set = OUTFIT_SETS.find((entry) => entry.id === 'phoenix')!;
  const owned = Object.values(set.items).filter((id) => id !== 'hat-phoenix') as string[];
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: owned, language: 'vi' });
  fixture.state().equipped = { ...set.items, hat: 'hat-basic' };
  await page.goto('/');
  await page.getByRole('button', { name: 'Hồ sơ nhân vật', exact: true }).click();
  await page.locator('.character-set-details summary').click();
  const row = page.locator('.character-set-list [data-set-id="phoenix"]');
  await expect(row).toContainText('6/7');
  await expect(row.getByRole('button', { name: 'Mặc thử bộ Phượng hoàng', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Xem phần thưởng', exact: true }).click();
  const catalogue = page.getByRole('dialog');
  await catalogue.getByRole('button', { name: 'Huyền thoại', exact: true }).click();
  await catalogue.getByLabel('Lọc loại vật phẩm', { exact: true }).selectOption('hat');
  const item = COSMETICS.find((entry) => entry.id === 'hat-phoenix')!;
  await catalogue.getByRole('button', { name: `Thử ${item.vi}`, exact: true }).click();
  await expect(page.locator('.character-stage .pixel-character [data-attachment="phoenix-halo"]')).toHaveCount(1);
  await expect(page.locator('.character-stage .full-set-effect')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu trang phục', exact: true })).toBeDisabled();
  await expect(page.locator('.character-set-list [data-set-id="phoenix"]')).toContainText('6/7');
  expect(fixture.state().equipped.hat).toBe('hat-basic');
  expect(fixture.state().ownedItemIds).not.toContain('hat-phoenix');
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.exchangeRequests).toHaveLength(0);
});
