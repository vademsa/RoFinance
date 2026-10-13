import { expect, test } from '@playwright/test';
import { COSMETICS } from '../../shared/character';
import { characterFixture } from './fixture';

test('equipped aura follows preview, save, removal and public cosmetic rendering without changing finances', async ({ page }, info) => {
  const rare = COSMETICS.find((item) => item.slot === 'shirt' && item.rarity === 'rare')!;
  const special = COSMETICS.find((item) => item.slot === 'shirt' && item.rarity === 'special')!;
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: [rare.id, special.id, 'shirt-phoenix', 'hat-comet'] });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.waitForTimeout(1200);
  const finance = structuredClone(fixture.finance()); const writes = fixture.writes();
  const stage = page.locator('.character-stage');
  await expect(stage.locator('.equipped-aura')).toHaveCount(0);
  await page.getByRole('button', { name: 'Shirts', exact: true }).click();
  for (const [name, aura] of [[rare.en, 'purple'], [special.en, 'gold'], ['Phoenix shirt', 'platinum']]) {
    await page.getByRole('button', { name: `Preview ${name}`, exact: true }).click();
    await expect(stage.locator('.equipped-aura')).toHaveAttribute('data-aura', aura);
    await expect(stage.locator('.cosmetic-aura-rays')).toHaveCSS('animation-name', 'cosmetic-aura-turn');
    await expect(stage.locator('.equipped-aura')).toHaveCSS('pointer-events', 'none');
    expect((await stage.boundingBox())!.height).toBeLessThanOrEqual(240);
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`equipped-${aura}.png`) });
  }
  await page.getByRole('button', { name: 'Hats', exact: true }).click();
  const secret = COSMETICS.find((item) => item.id === 'hat-comet')!;
  await page.getByRole('button', { name: `Preview ${secret.en}`, exact: true }).click();
  await expect(stage.locator('.equipped-aura')).toHaveAttribute('data-aura', 'rainbow');
  expect(fixture.state().equipped.shirt).toBe('shirt-basic');
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped.hat).toBe('hat-comet');
  await page.getByRole('button', { name: 'Remove accessory', exact: true }).click();
  await expect(stage.locator('.equipped-aura')).toHaveAttribute('data-aura', 'platinum');
  await page.getByRole('button', { name: 'Reset preview', exact: true }).click();
  await expect(stage.locator('.equipped-aura')).toHaveAttribute('data-aura', 'rainbow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage.locator('.cosmetic-aura-rays').first()).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.character-companion-portrait .equipped-aura')).toHaveAttribute('data-aura', 'rainbow');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('.character-ranking-portrait .equipped-aura')).toHaveCount(3);
  await expect(page.locator('.character-ranking-portrait [data-slot="expression"]').first()).toHaveAttribute('data-mood', 'steady');
  expect(fixture.finance()).toEqual(finance);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.materialRequests).toHaveLength(0);
});

test('cards expose titles without extra buttons on hover, touch and keyboard, without blocking material selection', async ({ page }, info) => {
  const phone = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: phone, ownedItemIds: ['shirt-rose'], duplicateItemCounts: { 'shirt-rose': 2 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  const assertDetails = async (card: ReturnType<typeof page.locator>) => {
    await expect(card.locator('.cosmetic-title-trigger')).toHaveCount(0);
    if (phone) await card.locator('h3').tap(); else await card.hover();
    const tooltip = card.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    if (phone) {
      await card.locator('h3').tap(); await expect(tooltip).toBeHidden();
      await card.locator('h3').tap(); await expect(tooltip).toBeVisible();
    }
    await card.focus();
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await card.press('Enter'); await expect(tooltip).toBeVisible();
    await card.press('Escape'); await expect(tooltip).toBeHidden();
  };
  await assertDetails(page.locator('.character-owned-collection .character-item').first());
  await page.getByRole('button', { name: 'View rewards', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reward catalogue' });
  await assertDetails(dialog.locator('.reward-prize').first());
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close rewards' }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.locator('.character-owned-collection .character-slots').getByRole('button', { name: 'Shirts', exact: true }).click();
  await page.getByRole('button', { name: 'Recycle Rose shirt', exact: true }).click();
  const material = page.locator('.duplicate-materials .character-item').first();
  await assertDetails(material);
  if (!phone) await material.hover();
  await material.getByRole('combobox', { name: 'Copies Rose shirt' }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Recycle 2 spare copies', exact: true })).toBeEnabled();
  expect(fixture.materialRequests).toHaveLength(0);
  expect(fixture.state().duplicateItemCounts?.['shirt-rose']).toBe(2);
});
