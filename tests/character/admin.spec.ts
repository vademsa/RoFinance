import { test, expect, type Page } from '@playwright/test';
import type { AdminOverview } from '../../shared/admin';
import { COSMETICS } from '../../shared/character';

const overview: AdminOverview = { version: 1, mode: 'read-only', generatedAt: '2026-10-11T05:00:00.000Z',
  counts: { accounts: 12, characters: 9, rankingParticipants: 3, drawsLast7Days: 27 },
  catalogue: { total: COSMETICS.length, prizes: COSMETICS.filter(item => !item.starter).length, signature: 7, hidden: 7 },
  release: { apiRevision: 'a'.repeat(64), webRevision: '11111111-1111-4111-8111-111111111111' } };

async function fixture(page: Page) {
  let status = 200;
  let body: unknown = overview;
  let logoutStatus = 200;
  let delay: Promise<void> | null = null;
  const calls: { path: string; method: string }[] = [];
  await page.context().route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    calls.push({ path, method: request.method() });
    const currentStatus = path === '/api/auth/logout' ? logoutStatus : path === '/api/admin/overview' ? status : 401;
    const currentBody = path === '/api/auth/logout' ? { success: true } : body;
    const pending = path === '/api/admin/overview' ? delay : null;
    if (pending) await pending;
    await route.fulfill({ status: currentStatus, contentType: 'application/json', body: JSON.stringify(currentBody) }).catch(() => {});
  });
  return { calls, response: (code: number, value: unknown = { error: 'ADMIN_FORBIDDEN' }) => { status = code; body = value; }, delay: (pending: Promise<void> | null) => { delay = pending; }, logout: (code: number) => { logoutStatus = code; } };
}

test('admin overview/catalogue bilingual filters pagination themes and responsive layout never load or save finances', async ({ page }, info) => {
  const f = await fixture(page); await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Tổng quan hệ thống', exact: true })).toBeVisible();
  await expect(page.locator('.admin-metric')).toHaveCount(4);
  await expect(page.locator('.admin-metric').first()).toContainText('12');
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Đổi giao diện sáng tối' })).toBeVisible();
  }
  await page.setViewportSize(info.project.use.viewport!);
  await page.screenshot({ path: info.outputPath('admin-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Chuyển sang tiếng Anh' }).click();
  await expect(page.getByRole('heading', { name: 'System overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', info.project.name.includes('light') ? 'dark' : 'light');
  await page.getByRole('button', { name: 'Toggle light and dark theme' }).click();
  await page.getByRole('button', { name: 'Item catalogue', exact: true }).click();
  await expect(page.locator('.admin-item')).toHaveCount(12);
  await expect(page.locator('.admin-pagination')).toContainText('Page 1 / 10');
  const first = await page.locator('.admin-item').first().getAttribute('data-item-id');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.admin-pagination')).toContainText('Page 2 / 10');
  expect(await page.locator('.admin-item').first().getAttribute('data-item-id')).not.toBe(first);
  await page.getByLabel('Find an item', { exact: true }).fill('rofinance');
  await expect(page.locator('.admin-item')).toHaveCount(7);
  await page.getByRole('combobox', { name: 'Equipment slot', exact: true }).selectOption('shirt');
  await expect(page.locator('.admin-item')).toHaveCount(1);
  await expect(page.locator('.admin-item')).toHaveAttribute('data-item-id', 'shirt-rofinance');
  await page.getByRole('combobox', { name: 'Rarity', exact: true }).selectOption('rare');
  await expect(page.getByText('No matching items.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Rarity', exact: true }).selectOption('legendary');
  await page.getByRole('button', { name: 'Switch to Vietnamese' }).click();
  await expect(page.locator('.admin-item')).toContainText('Áo RoFinance Signature');
  await page.screenshot({ path: info.outputPath('admin-catalogue-signature.png'), fullPage: true });
  expect(f.calls.every(call => call.path === '/api/admin/overview' && call.method === 'GET')).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});

for (const denial of [401, 403, 503, 'malformed'] as const) test(`admin ${denial} response never exposes metrics or catalogue`, async ({ page }) => {
  const f = await fixture(page); f.response(denial === 'malformed' ? 200 : denial, denial === 'malformed' ? { role: 'admin', email: 'darkroller210@gmail.com' } : { error: 'PRIVATE_BACKEND_DATA' });
  await page.addInitScript(() => localStorage.setItem('role', 'admin'));
  await page.goto('/admin?role=admin');
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', denial === 401 ? 'login' : denial === 403 ? 'forbidden' : 'error');
  await expect(page.locator('.admin-metric, .admin-item, .admin-sidebar')).toHaveCount(0);
  await expect(page.getByText('PRIVATE_BACKEND_DATA')).toHaveCount(0);
  await expect(page.locator('.admin-access a[href="/"]')).toBeVisible();
  expect(f.calls.every(call => call.path === '/api/admin/overview')).toBe(true);
});

test('admin resume/revalidation discards previous authorized data and a delayed response cannot restore it after denial', async ({ page }) => {
  const f = await fixture(page); await page.goto('/admin');
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'ready');
  let release!: () => void; f.delay(new Promise<void>(resolve => { release = resolve; }));
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await expect(page.locator('.admin-metric')).toHaveCount(0);
  f.delay(null); f.response(403);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'forbidden');
  release(); await page.waitForTimeout(200);
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'forbidden');
  await expect(page.locator('.admin-metric, .admin-item')).toHaveCount(0);
  expect(f.calls.every(call => call.method === 'GET' && call.path === '/api/admin/overview')).toBe(true);
});

test('failed sign-out clears admin data and retry rechecks access instead of deadlocking', async ({ page }) => {
  const f = await fixture(page); await page.goto('/admin');
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'ready');
  f.logout(503);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'error');
  await expect(page.locator('.admin-metric')).toHaveCount(0);
  f.response(401);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'login');
  expect(f.calls.filter(call => call.method !== 'GET')).toEqual([{ path: '/api/auth/logout', method: 'POST' }]);
});

test('admin backend release change forces a fresh page before accepting updated data', async ({ page }) => {
  const f = await fixture(page); await page.goto('/admin');
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'ready');
  f.response(200, { ...overview, counts: { ...overview.counts, accounts: 15 }, release: { ...overview.release, apiRevision: 'b'.repeat(64) } });
  await Promise.all([
    page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() }),
    page.getByRole('button', { name: 'Làm mới', exact: true }).click(),
  ]);
  await expect(page.locator('.admin-app')).toHaveAttribute('data-admin-status', 'ready');
  await expect(page.locator('.admin-metric').first()).toContainText('15');
  expect(f.calls.filter(call => call.path === '/api/admin/overview').length).toBeGreaterThanOrEqual(3);
  expect(f.calls.every(call => call.path === '/api/admin/overview' && call.method === 'GET')).toBe(true);
});
