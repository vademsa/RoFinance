import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { characterFixture } from './fixture';
import { getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';

async function setup(page: Page, vi: boolean) {
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance(); const tx = data.transactions[0];
  data.transactions = [
    { ...tx, id: 'breakfast', category: 'Breakfast test', categoryId: 'custom-breakfast', amount: 20000, description: 'Synthetic breakfast' },
    { ...tx, id: 'cafe', category: 'Cafe test', categoryId: 'custom-cafe', amount: 30000, description: 'Synthetic cafe' },
    { ...tx, id: 'transport', category: 'Transport test', categoryId: 'custom-transport', amount: 50000, description: 'Synthetic transport' },
    { ...tx, id: 'income-cafe', type: 'income', category: 'Cafe test', categoryId: 'custom-income', amount: 40000, description: 'Synthetic income' },
    { ...tx, id: 'income-other', type: 'income', category: 'Other income', categoryId: 'custom-other', amount: 60000, description: 'Synthetic other income' },
  ];
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  const end = new Date(`${data.activeCycleStart}T12:00:00`); end.setDate(end.getDate() - 1);
  data.monthlySummaries = [{ id: previous, cycleStart: previous, cycleEnd: toLocalDateKey(end), income: 1000000, expense: 70000,
    transactionCount: 1, spendingByJar: [{ jarId: tx.jarId, amount: 70000 }], createdAt: new Date().toISOString() }];
  data.transactions.push({ ...tx, id: 'old-breakfast', category: 'Breakfast test', categoryId: 'custom-breakfast', date: previous, amount: 70000, description: 'Synthetic previous cycle' });
  await page.goto('/'); await page.getByRole('button', { name: vi ? 'Thống Kê' : 'Analytics', exact: true }).click();
  const expenses = page.getByRole('region', { name: vi ? 'Chi tiêu theo danh mục' : 'Where the money went', exact: true });
  const income = page.getByRole('region', { name: vi ? 'Nguồn thu đã ghi giao dịch' : 'Recorded income sources', exact: true });
  await expect(expenses.getByRole('listitem')).toHaveCount(3);
  // Let any existing startup normalization settle before checking for writes.
  await page.waitForTimeout(1000);
  return { fixture, expenses, income, previous, writes: fixture.writes(), original: structuredClone(fixture.finance()) };
}

test('temporary selection/grouping preserves all financial data, original details, type separation and cycle reset', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, expenses, income, previous, writes, original } = await setup(page, vi);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const open = expenses.getByRole('button', { name: vi ? 'Chọn & nhóm danh mục' : 'Select & group categories', exact: true });
  await open.click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'Transport test', exact: true }).uncheck();
  await dialog.getByRole('textbox', { name: vi ? 'Tên nhóm lớn' : 'Parent group name', exact: true }).fill('Food test');
  await dialog.getByRole('button', { name: vi ? 'Thêm nhóm' : 'Add group', exact: true }).click();
  await dialog.getByRole('combobox', { name: `${vi ? 'Nhóm của' : 'Group for'} · Breakfast test`, exact: true }).selectOption('0');
  await expect(dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: `${vi ? 'Nhóm của' : 'Group for'} · Cafe test`, exact: true }).selectOption('0');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.screenshot({ path: info.outputPath('chart-group-editor.png') });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true }).click();
  await expect(open).toBeFocused();
  await expect(expenses.getByRole('listitem')).toHaveCount(1);
  await expect(expenses.getByText('Food test', { exact: true })).toBeVisible();
  await expect(expenses.getByText('100%', { exact: true })).toBeVisible();
  await expect(expenses).toContainText('2/3');
  await expect(income.getByRole('listitem')).toHaveCount(2);
  await expenses.screenshot({ path: info.outputPath('grouped-chart.png') });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: vi ? 'Xuất Excel cho chu kỳ đã chọn' : 'Export selected cycle to Excel', exact: true }).click();
  const download = await downloadEvent;
  const workbook = XLSX.read(await readFile((await download.path())!), { type: 'buffer' });
  const ledger = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets['Lịch Sử Giao Dịch']);
  expect(ledger.filter(row => row['Mã Giao Dịch'] === 'transport')).toHaveLength(1);
  expect(JSON.stringify(ledger)).not.toContain('Food test');
  expect(ledger.some(row => Object.values(row).includes('Breakfast test'))).toBe(true);
  await expenses.getByRole('button', { name: `${vi ? 'Xem giao dịch' : 'View transactions'} · Food test`, exact: true }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog.getByText('Synthetic breakfast', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Synthetic cafe', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Original category', { exact: true }).or(dialog.getByText('Danh mục gốc', { exact: true }))).toHaveCount(2);
  await expect(dialog.getByText('Synthetic income', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Synthetic previous cycle', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await open.click();
  await dialog.getByRole('button', { name: vi ? 'Bỏ chọn' : 'Clear selection', exact: true }).click();
  await dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true }).click();
  await expect(expenses.getByRole('img')).toHaveCount(0);
  await expect(expenses).toContainText(vi ? 'Chưa chọn danh mục để vẽ.' : 'No categories selected.');
  await expenses.getByRole('button', { name: vi ? 'Về biểu đồ gốc' : 'Reset chart', exact: true }).click();
  await expect(expenses.getByRole('listitem')).toHaveCount(3);
  // Cancel never changes the view.
  await open.click(); await dialog.getByRole('button', { name: vi ? 'Bỏ chọn' : 'Clear selection', exact: true }).click();
  await dialog.getByRole('button', { name: vi ? 'Hủy' : 'Cancel', exact: true }).click();
  await expect(expenses.getByRole('listitem')).toHaveCount(3);
  await open.click(); await dialog.getByRole('checkbox', { name: 'Transport test', exact: true }).uncheck();
  await dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true }).click();
  await page.locator('#analytics-cycle').selectOption(previous);
  await expect(expenses.getByRole('listitem')).toHaveCount(1);
  await page.locator('#analytics-cycle').selectOption('CURRENT');
  await expect(expenses.getByRole('listitem')).toHaveCount(3);
  expect(fixture.writes()).toBe(writes); expect(fixture.finance()).toEqual(original); expect(errors).toEqual([]);
});

test('AI only receives names, requires approval and rejects forged group members without changing saved data', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, expenses, writes, original } = await setup(page, vi);
  let forged = false; let calls = 0;
  await page.route('**/api/ai/category-groups', async route => {
    const body = route.request().postDataJSON(); calls++;
    expect(Object.keys(body).sort()).toEqual(['categories', 'language', 'type']);
    expect(body.language).toBe(vi ? 'vi' : 'en'); expect(body.type).toBe('expense');
    for (const row of body.categories) expect(Object.keys(row).sort()).toEqual(['id', 'label']);
    expect(JSON.stringify(body)).not.toMatch(/amount|jarId|bankAccount|Synthetic|description/);
    const ids = body.categories.filter((row: { label: string }) => ['Breakfast test', 'Cafe test'].includes(row.label)).map((row: { id: string }) => row.id);
    await route.fulfill({ json: { groups: [{ name: 'AI Food test', memberIds: forged ? [ids[0], 'c999'] : ids }] } });
  });
  const open = expenses.getByRole('button', { name: vi ? 'Chọn & nhóm danh mục' : 'Select & group categories', exact: true });
  await open.click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: vi ? 'Nhờ AI đề xuất nhóm' : 'Ask AI for groups', exact: true }).click();
  await expect(dialog.getByText('AI Food test', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(0); // preview is not applied
  await expect(expenses.getByText('AI Food test', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: vi ? 'Dùng đề xuất này' : 'Use these suggestions', exact: true }).click();
  await expect(dialog.getByRole('combobox')).toHaveCount(3);
  await dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true }).click();
  await expect(expenses.getByText('AI Food test', { exact: true })).toBeVisible();
  await expect(expenses.getByRole('listitem')).toHaveCount(2);
  forged = true; await open.click();
  await dialog.getByRole('button', { name: vi ? 'Nhờ AI đề xuất nhóm' : 'Ask AI for groups', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(vi ? 'Đề xuất không hợp lệ' : 'Invalid suggestion');
  await expect(dialog.getByRole('button', { name: vi ? 'Dùng đề xuất này' : 'Use these suggestions', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(expenses.getByRole('listitem')).toHaveCount(2);
  expect(calls).toBe(2); expect(fixture.writes()).toBe(writes); expect(fixture.finance()).toEqual(original);
});

test('changing the selection cancels pending AI and stale responses cannot replace the user draft', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { expenses, fixture, writes, original } = await setup(page, vi);
  let finish: (() => void) | undefined;
  await page.route('**/api/ai/category-groups', async route => {
    const body = route.request().postDataJSON();
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ json: { groups: [{ name: 'Stale AI group', memberIds: body.categories.slice(0, 2).map((row: { id: string }) => row.id) }] } }).catch(() => undefined);
  });
  const open = expenses.getByRole('button', { name: vi ? 'Chọn & nhóm danh mục' : 'Select & group categories', exact: true });
  await open.click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: vi ? 'Nhờ AI đề xuất nhóm' : 'Ask AI for groups', exact: true }).click();
  await expect.poll(() => Boolean(finish)).toBe(true);
  await dialog.getByRole('checkbox', { name: 'Transport test', exact: true }).uncheck(); finish!();
  await expect(dialog.getByRole('button', { name: vi ? 'Nhờ AI đề xuất nhóm' : 'Ask AI for groups', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: vi ? 'Dùng đề xuất này' : 'Use these suggestions', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: vi ? 'Vẽ biểu đồ' : 'Apply to chart', exact: true }).click();
  await expect(expenses.getByRole('listitem')).toHaveCount(2);
  await expect(expenses.getByText('Stale AI group', { exact: true })).toHaveCount(0);
  await open.click(); await page.mouse.click(2, 2); await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(fixture.writes()).toBe(writes); expect(fixture.finance()).toEqual(original);
});

test('privacy hides chart controls and AI suggestions; hidden amounts never appear in chart markup', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  fixture.finance().isAmountsHidden = true;
  await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  const expenses = page.getByRole('region', { name: 'Where the money went', exact: true });
  await expect(expenses.getByRole('button', { name: 'Select & group categories', exact: true })).toHaveCount(0);
  await expect(expenses.locator('svg, li, [role="tooltip"]')).toHaveCount(0);
  await expect(expenses).toContainText('Turn off Hide Amounts to view chart details.');
});
