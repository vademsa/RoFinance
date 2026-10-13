import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';

test('new branding loads with responsive headers, profile and legal pages in both themes', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Profile of Private account', exact: true })).toBeVisible();
  // Let the existing initial fixture-data normalisation finish before comparing.
  await page.waitForTimeout(1200);
  const before = structuredClone({ writes: fixture.writes(), finance: fixture.finance() });
  const initialLogo = page.locator('header [data-brand-logo]').filter({ visible: true });
  await expect.poll(() => initialLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('header').screenshot({ path: info.outputPath('initial-brand-header.png') });
  for (const width of [320, 375, 480, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const logo = page.locator(`header [data-brand-logo="${width < 480 ? 'icon' : 'wordmark'}"]`);
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(logo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (width >= 480) {
      expect(await logo.evaluate(image => getComputedStyle(image.parentElement!).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    }
    expect(await page.locator('header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const profile = page.getByRole('button', { name: 'Profile of Private account', exact: true });
    const rect = await profile.boundingBox(); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  }
  await page.locator('header').screenshot({ path: info.outputPath('brand-header.png') });
  await page.getByRole('button', { name: 'Profile of Private account', exact: true }).click();
  const modalLogo = page.locator('[data-brand-logo="icon"]').filter({ visible: true }).last();
  await expect(modalLogo).toBeVisible();
  await expect.poll(() => modalLogo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(fixture.writes()).toBe(before.writes);
  expect(fixture.finance()).toEqual(before.finance);
  for (const url of ['/privacy-policy', '/terms-of-service']) {
    await page.goto(url);
    const logo = page.locator('header [data-brand-logo="icon"]');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('signed-out landing and sign-in show the new logo without changing account data', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  await page.context().route('**/api/auth/me', route => route.fulfill({ json: { user: null } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RoFinance', exact: true })).toBeVisible();
  const landingLogo = page.locator('[data-brand-logo="icon"]');
  await expect.poll(() => landingLogo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Đăng nhập / Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập RoFinance', exact: true })).toBeVisible();
  await expect(page.locator('[data-brand-logo="icon"]')).toHaveCount(2);
  await expect.poll(() => page.locator('[data-brand-logo="icon"]').last().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(fixture.writes()).toBe(0);
});
