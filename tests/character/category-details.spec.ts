import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { characterFixture } from './fixture';
import { getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';

test('category counts open paginated read-only details for the selected type/cycle and restore focus when closed', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance();
  const date = data.transactions[0].date;
  const jarId = data.jars[0].id;
  data.bankAccounts = [{ id: 'actual-source', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 1000000,
    openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  data.transactions = Array.from({ length: 12 }, (_, i) => ({ id: `expense-${String(i).padStart(2, '0')}`, type: 'expense', date, jarId, amount: 30000,
    category: 'Tiền điện riêng', categoryId: 'custom-saved', description: `Synthetic expense ${i}`, bankAccountId: 'actual-source', paymentMethodCode: 'VCB', counterpartyName: 'Test counterparty' }));
  data.transactions.push({ id: 'current-income', type: 'income', date, jarId, amount: 50000, category: 'Tiền điện riêng', categoryId: 'custom-income', description: 'Synthetic income', paymentMethodCode: 'CASH' });
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  const end = new Date(`${data.activeCycleStart}T12:00:00`); end.setDate(end.getDate() - 1);
  data.monthlySummaries = [{ id: previous, cycleStart: previous, cycleEnd: toLocalDateKey(end), income: 1000000, expense: 70000, transactionCount: 1,
    spendingByJar: [{ jarId, amount: 70000 }], createdAt: new Date().toISOString() }];
  data.transactions.push({ id: 'historical-expense', type: 'expense', date: previous, jarId, amount: 70000, category: 'Tiền điện riêng', categoryId: 'custom-saved', description: 'Synthetic previous cycle', paymentMethodCode: 'CASH' });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Thống Kê' : 'Analytics', exact: true }).click();
  const expense = page.getByRole('region', { name: vi ? 'Chi tiêu theo danh mục' : 'Where the money went', exact: true });
  const income = page.getByRole('region', { name: vi ? 'Nguồn thu đã ghi giao dịch' : 'Recorded income sources', exact: true });
  const trigger = expense.getByRole('button', { name: `${vi ? 'Xem giao dịch' : 'View transactions'} · Tiền điện riêng`, exact: true });
  await expect(trigger).toContainText('12');
  await expect(trigger).not.toContainText('↗');
  await expect(trigger.locator('svg')).toHaveCount(0);
  const countBounds = await trigger.boundingBox();
  expect(countBounds!.height).toBeGreaterThanOrEqual(24);
  expect(countBounds!.height).toBeLessThanOrEqual(26);
  await expense.screenshot({ path: info.outputPath('compact-category-counts.png') });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Tiền điện riêng', exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(10);
  await expect(dialog.getByText('Synthetic expense 0', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Vietcombank · 123456789', { exact: true })).toHaveCount(10);
  await expect(dialog.getByText('Synthetic income', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Synthetic previous cycle', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: vi ? 'Giao dịch tiếp theo' : 'Next transactions', exact: true }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog.getByText('Synthetic expense 10', { exact: true })).toBeVisible();
  await dialog.screenshot({ path: info.outputPath('category-transactions.png') });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await income.getByRole('button', { name: `${vi ? 'Xem giao dịch' : 'View transactions'} · Tiền điện riêng`, exact: true }).click();
  await expect(dialog.getByText('Synthetic income', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  // Clicking the native dialog backdrop closes it, without a financial write.
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await page.locator('#analytics-cycle').selectOption(previous);
  await trigger.click();
  await expect(dialog.getByText('Synthetic previous cycle', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  await dialog.getByRole('button', { name: vi ? 'Đóng chi tiết danh mục' : 'Close category details', exact: true }).click();
  await page.locator('#analytics-cycle').selectOption('CURRENT');
  expect(errors).toEqual([]);
});

test('Excel download groups category rows, keeps the selected cycle and includes native chart parts', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const data = fixture.finance();
  const tx = data.transactions[0];
  data.transactions = [
    { ...tx, id: 'one-b', category: 'Custom B', amount: 10000 },
    { ...tx, id: 'one-a', category: 'Custom A', amount: 20000 },
    { ...tx, id: 'two-b', category: 'Custom B', amount: 30000 },
    { ...tx, id: 'one-income', type: 'income', category: 'Custom income', amount: 40000 },
  ];
  await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected cycle to Excel', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain(data.activeCycleStart);
  const bytes = await readFile((await download.path())!);
  const files = unzipSync(bytes);
  const charts = Object.entries(files).filter(([path]) => /^xl\/charts\/rofinance-chart-\d+\.xml$/.test(path));
  expect(charts).toHaveLength(4);
  expect(charts.filter(([, bytes]) => strFromU8(bytes).includes('<c:pieChart>'))).toHaveLength(2);
  const workbook = XLSX.read(bytes, { type: 'buffer', cellNF: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets['Lịch Sử Giao Dịch']);
  expect(rows.map(row => row['Mã Giao Dịch'])).toEqual(['one-a', 'TỔNG DANH MỤC', 'one-b', 'two-b', 'TỔNG DANH MỤC', 'one-income', 'TỔNG DANH MỤC']);
  expect(rows.find(row => row['Mã Giao Dịch'] === 'one-b')?.['Số Tiền (₫)']).toBe(10000);
  expect(workbook.Sheets['Tổng Quan'].B4.v).toBe(60000);
  expect(workbook.Sheets['Danh Mục Thu Chi'].D2.z).toContain('₫');
});
