import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
import { getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';

test('both category donuts include every custom category, paginate names and follow the selected salary cycle', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const finance = fixture.finance();
  const date = finance.transactions[0].date;
  const jarId = finance.jars[0].id;
  finance.transactions = ['expense', 'income'].flatMap(type => Array.from({ length: 9 }, (_, i) => ({
    id: `${type}-${i}`, type: type as 'expense' | 'income', date, jarId,
    amount: (9 - i) * (type === 'expense' ? 100000 : 10000),
    category: type === 'expense' ? `Tiền điện riêng ${i}` : `Thu nhập riêng ${i}`,
    categoryId: `custom-${type}-${i}`, description: 'Synthetic category test', paymentMethodCode: 'CASH',
  })));
  finance.jars[0].currentSpent = 4500000;
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  const end = new Date(`${finance.activeCycleStart}T12:00:00`); end.setDate(end.getDate() - 1);
  finance.monthlySummaries = [{ id: previous, cycleStart: previous, cycleEnd: toLocalDateKey(end), income: 1000000,
    expense: 123456, transactionCount: 2, spendingByJar: [{ jarId, amount: 123456 }], createdAt: new Date().toISOString() }];
  finance.transactions.push(
    { id: 'old-expense', type: 'expense', date: previous, jarId, amount: 123456, category: 'Chi cũ riêng', categoryId: 'custom-old-expense', description: 'Old synthetic expense', paymentMethodCode: 'CASH' },
    { id: 'old-income', type: 'income', date: previous, jarId, amount: 200000, category: 'Thu cũ riêng', categoryId: 'custom-old-income', description: 'Old synthetic receipt', paymentMethodCode: 'CASH' },
  );
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Thống Kê' : 'Analytics', exact: true }).click();
  const expenses = page.getByRole('region', { name: vi ? 'Chi tiêu theo danh mục' : 'Where the money went', exact: true });
  const income = page.getByRole('region', { name: vi ? 'Nguồn thu đã ghi giao dịch' : 'Recorded income sources', exact: true });
  for (const [region, prefix] of [[expenses, 'Tiền điện riêng'], [income, 'Thu nhập riêng']] as const) {
    await expect(region.getByRole('img')).toBeVisible();
    await expect(region.locator('.recharts-pie-sector')).toHaveCount(9);
    await expect(region.getByRole('listitem')).toHaveCount(6);
    await expect(region.getByText(`${prefix} 0`, { exact: true })).toBeVisible();
    await expect(region.getByText('20%', { exact: true })).toBeVisible();
    await expect(region.getByText(/Danh mục khác|Other categories/)).toHaveCount(0);
    await region.getByRole('button', { name: vi ? 'Danh mục tiếp theo' : 'Next categories', exact: true }).click();
    await expect(region.getByRole('listitem')).toHaveCount(3);
    for (let i = 6; i < 9; i++) await expect(region.getByText(`${prefix} ${i}`, { exact: true })).toBeVisible();
    await expect(region.getByRole('button', { name: vi ? 'Danh mục tiếp theo' : 'Next categories', exact: true })).toBeDisabled();
  }
  await expenses.scrollIntoViewIfNeeded();
  await expenses.screenshot({ path: info.outputPath('custom-expense-donut.png') });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#analytics-cycle').selectOption(previous);
  await expect(expenses.getByText('Chi cũ riêng', { exact: true })).toBeVisible();
  await expect(income.getByText('Thu cũ riêng', { exact: true })).toBeVisible();
  await expect(expenses.locator('.recharts-pie-sector')).toHaveCount(1);
  await expect(income.getByText('100%', { exact: true })).toBeVisible();
  await expect(income.getByText(vi ? 'Tổng giao dịch đã phân loại có thể khác thu nhập đã xác nhận.' : 'Categorized transactions may differ from confirmed cycle income.', { exact: true })).toBeVisible();
  await expect(expenses.getByText('Tiền điện riêng 0', { exact: true })).toHaveCount(0);
  await page.locator('#analytics-cycle').selectOption('CURRENT');
  await expect(expenses.getByText('Tiền điện riêng 0', { exact: true })).toBeVisible();
  await expect(income.getByText('Thu nhập riêng 0', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('privacy mode unmounts both donuts and all category amounts until amounts are shown again', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  fixture.finance().isAmountsHidden = true;
  await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  const expenses = page.getByRole('region', { name: 'Where the money went', exact: true });
  const income = page.getByRole('region', { name: 'Recorded income sources', exact: true });
  for (const region of [expenses, income]) {
    await expect(region.getByRole('img')).toHaveCount(0);
    await expect(region.locator('svg, li, [role="tooltip"]')).toHaveCount(0);
    await expect(region.getByText('Turn off Hide Amounts to view chart details.', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Show all amounts', exact: true }).click();
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(expenses.getByRole('img')).toBeVisible();
  await expect(expenses.getByRole('listitem')).toHaveCount(1);
  await expect(income.getByRole('img')).toHaveCount(0);
});

test('switching language and currency updates labels without translating custom names or changing percentages', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const finance = fixture.finance();
  finance.transactions = [
    { ...finance.transactions[0], id: 'default-category', category: 'Ăn sáng', categoryId: 'default-expense-nec-breakfast', amount: 90000 },
    { ...finance.transactions[0], id: 'custom-category', category: 'Tiền điện riêng', categoryId: 'custom-saved-name', amount: 30000 },
  ];
  await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  let expenses = page.getByRole('region', { name: 'Where the money went', exact: true });
  await expect(expenses.getByText('Breakfast', { exact: true })).toBeVisible();
  await expect(expenses.getByText('Tiền điện riêng', { exact: true })).toBeVisible();
  await expect(expenses.getByText('75%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Display Settings', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: 'USD ($)', exact: true }).click();
  await settings.getByRole('button', { name: 'Vietnamese', exact: true }).click();
  await settings.getByRole('button', { name: 'Đóng cài đặt', exact: true }).click();
  expenses = page.getByRole('region', { name: 'Chi tiêu theo danh mục', exact: true });
  await expect(expenses.getByText('Ăn sáng', { exact: true })).toBeVisible();
  await expect(expenses.getByText('Tiền điện riêng', { exact: true })).toBeVisible();
  await expect(expenses.getByText('75%', { exact: true })).toBeVisible();
  await expect(expenses).toContainText('US$');
  await page.getByRole('button', { name: 'Cài đặt hiển thị', exact: true }).click();
  await settings.getByRole('button', { name: 'English', exact: true }).click();
  await settings.getByRole('button', { name: 'Close Settings', exact: true }).click();
  expenses = page.getByRole('region', { name: 'Where the money went', exact: true });
  await expect(expenses.getByText('Breakfast', { exact: true })).toBeVisible();
  await expect(expenses.getByText('Tiền điện riêng', { exact: true })).toBeVisible();
  await expect(expenses).toContainText('$');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
