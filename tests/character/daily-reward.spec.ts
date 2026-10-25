import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
test('expense logging automatically credits daily points once without confirmation', async ({ page }, info) => {
  const language = info.project.name === 'phone-light' ? 'vi' : 'en';
  const fixture = await characterFixture(page, { language, light: language === 'vi' });
  await page.goto('/');
  await page.getByRole('button', { name: /^(Transactions|Giao dịch)$/ }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /^(New transaction|Ghi Nhận Giao Dịch Mới)$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#transaction-amount').fill('1000');
    await dialog.locator('input[maxlength="500"]').fill(`Daily expense ${i}`);
    await dialog.getByRole('button', { name: /^(Save Transaction|Lưu Giao Dịch)$/ }).click();
    await expect.poll(() => fixture.finance().transactions.some(tx => tx.description === `Daily expense ${i}`)).toBe(true);
    await expect.poll(() => fixture.state().bonusPoints).toBe(20);
    if (i === 0) {
      await expect(page.getByText(/^\+20 (draw points|điểm quay thưởng)/)).toBeVisible();
      await page.getByRole('button', { name: /^(Dismiss reward notification|Đóng thông báo điểm thưởng)$/ }).click();
    } else await expect(page.getByText(/^\+20 (draw points|điểm quay thưởng)/)).toHaveCount(0);
  }
});
