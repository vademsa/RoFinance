import { test, expect } from '@playwright/test';
import { PASSWORD_REQUIREMENTS_VI } from '../../shared/passwordPolicy';

test('registration validates policy before requests, displays hint, and does not enforce strength on legacy login', async ({ page }) => {
  const writes: { path: string; password: string }[] = [];
  await page.context().route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') { await route.fulfill({ json: { user: null } }); return; }
    if (path === '/api/auth/providers') { await route.fulfill({ json: { google: false, apple: false } }); return; }
    if (path === '/api/app-version') { await route.fulfill({ json: { apiRevision: 'a'.repeat(64), webRevision: null } }); return; }
    if (path === '/api/auth/register' || path === '/api/auth/login') {
      writes.push({ path, password: request.postDataJSON().password });
      await route.fulfill({ status: 400, json: { error: 'Synthetic backend rejection' } }); return;
    }
    throw new Error('Unexpected registration fixture route');
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Đăng nhập / Tạo tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo Tài Khoản Mới', exact: true }).click();
  const password = page.locator('input[type=password]');
  await expect(password).toHaveAttribute('autocomplete', 'new-password'); await expect(password).toHaveAttribute('minlength', '8');
  await expect(page.locator('#registration-password-policy')).toHaveText(PASSWORD_REQUIREMENTS_VI);
  await page.locator('input[type=email]').fill('fixture@example.test'); await password.fill('abcdefgh1');
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText(PASSWORD_REQUIREMENTS_VI, { exact: true })).toHaveCount(2); expect(writes).toHaveLength(0);
  await password.fill('Abcdefg1'); await page.locator('form button[type=submit]').click();
  await expect(page.getByText('Synthetic backend rejection', { exact: true })).toBeVisible(); expect(writes).toEqual([{ path: '/api/auth/register', password: 'Abcdefg1' }]);
  await page.getByRole('button', { name: 'Đăng Nhập', exact: true }).click();
  await expect(password).not.toHaveAttribute('minlength'); await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await password.fill('old'); await page.locator('form button[type=submit]').click();
  await expect.poll(() => writes.length).toBe(2); expect(writes[1]).toEqual({ path: '/api/auth/login', password: 'old' });
});
