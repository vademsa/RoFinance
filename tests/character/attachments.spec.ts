import { expect, test } from '@playwright/test';
import { COSMETICS } from '../../shared/character';
import { legendaryAttachment } from '../../src/utils/legendaryAttachments';
import { characterFixture } from './fixture';

test('legendary wings and halos are consistent in inventory, preview, saved outfit and smaller portraits', async ({ page }, info) => {
  const items = COSMETICS.filter((item) => legendaryAttachment(item));
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', ownedItemIds: items.map((item) => item.id) });
  fixture.state().equipped = { ...fixture.state().equipped, hat: 'hat-celestial', backpack: 'backpack-celestial' };
  const inventory = [...fixture.state().ownedItemIds];
  const points = fixture.state().spentPoints;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.character-companion-portrait [data-attachment="angel-wings"]')).toHaveCount(1);
  await expect(page.locator('.character-companion-portrait [data-attachment="angel-halo"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  // The app normalises legacy bank labels on startup; snapshot after that save,
  // so only changes caused by outfit actions are compared below.
  await expect.poll(() => fixture.finance().transactions[0].bankName).toBe('Tiền mặt');
  const finance = structuredClone(fixture.finance());
  const writes = fixture.writes();
  const stage = page.locator('.character-stage');
  const wardrobe = page.locator('.character-owned-collection');
  for (const slot of ['backpack', 'hat'] as const) {
    await wardrobe.getByRole('button', { name: slot === 'hat' ? 'Hats' : 'Backpacks', exact: true }).click();
    for (const item of items.filter((entry) => entry.slot === slot)) {
      const shape = legendaryAttachment(item)!;
      const preview = wardrobe.getByRole('button', { name: `Preview ${item.en}`, exact: true });
      await expect(preview.locator(`[data-attachment="${shape}"]`)).toHaveCount(1);
      await preview.click();
      const worn = stage.locator(`.pixel-character [data-slot="${slot}"]`);
      await expect(worn.locator(`[data-attachment="${shape}"]`)).toHaveCount(1);
      const bounds = await worn.locator('[data-attachment]').evaluate((node) => {
        const b = (node as SVGGraphicsElement).getBBox();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(64);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(slot === 'hat' ? 18 : 74);
      await expect(stage.locator('.pixel-character [data-slot="face"]')).toHaveCount(1);
      await expect(stage.locator('.pixel-character [data-slot="expression"]')).toHaveAttribute('data-mood', /happy|steady|worried|attention/);
      await stage.screenshot({ path: info.outputPath(`${shape}.png`) });
    }
  }
  await page.getByRole('button', { name: 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped.backpack).toBe('backpack-dragon');
  await expect.poll(() => fixture.state().equipped.hat).toBe('hat-singularity');
  // Canonical saved IDs persist; visual upgrades do not grant items or spend points.
  expect(fixture.state().ownedItemIds).toEqual(inventory);
  expect(fixture.state().spentPoints).toBe(points);
  expect(fixture.finance()).toEqual(finance);
  expect(fixture.writes()).toBe(writes);
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.materialRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Remove accessory', exact: true }).click();
  await expect(stage.locator('.pixel-character [data-slot="hat"]')).toHaveCount(0);
  await expect(stage.locator('.pixel-character [data-attachment="dragon-wings"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('.character-ranking-portrait [data-attachment="dragon-wings"]')).toHaveCount(3);
  await expect(page.locator('.character-ranking-portrait [data-attachment="singularity-halo"]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reward popup uses complete uncropped wing/halo sprites and existing rarity effects', async ({ page }, info) => {
  const items = COSMETICS.filter((item) => legendaryAttachment(item));
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'vi', ownedItemIds: items.map((item) => item.id) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Hồ sơ nhân vật', exact: true }).click();
  await page.getByRole('button', { name: 'Xem phần thưởng', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Danh sách phần thưởng' });
  await dialog.getByRole('button', { name: 'Huyền thoại', exact: true }).click();
  for (const slot of ['backpack', 'hat']) {
    await dialog.getByLabel('Lọc loại vật phẩm', { exact: true }).selectOption(slot);
    await expect(dialog.locator('[data-attachment]')).toHaveCount(4);
    for (const item of items.filter((entry) => entry.slot === slot)) {
      const art = dialog.locator(`.cosmetic-artwork[data-cosmetic-id="${item.id}"]`);
      await expect(art).toHaveAttribute('data-aura', item.secret ? 'rainbow' : 'platinum');
      const sprite = art.getByRole('img', { name: item.vi, exact: true });
      await expect(sprite).toHaveAttribute('viewBox', slot === 'backpack' ? '0 18 64 54' : '9 0 48 18');
      const bounds = await sprite.evaluate((node) => {
        const svg = node as SVGSVGElement;
        const b = (svg.querySelector('[data-attachment]') as SVGGraphicsElement).getBBox();
        const v = svg.viewBox.baseVal;
        return { left: b.x >= v.x, top: b.y >= v.y, right: b.x + b.width <= v.x + v.width, bottom: b.y + b.height <= v.y + v.height };
      });
      expect(bounds).toEqual({ left: true, top: true, right: true, bottom: true });
    }
    await dialog.screenshot({ path: info.outputPath(`legendary-${slot}-catalogue.png`) });
  }
  expect(fixture.drawRequests).toHaveLength(0);
  expect(fixture.materialRequests).toHaveLength(0);
});
