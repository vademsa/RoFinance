import { test, expect, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { characterFixture } from './fixture';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import { validateCustomCategories } from '../../server/categoryValidation';

async function setup(page: Page, light: boolean) {
  const fixture = await characterFixture(page, { light, language: light ? 'vi' : 'en' });
  const data = fixture.finance();
  data.customCategories = [
    { id: 'custom-nec', name: 'Chi chung', type: 'expense', icon: 'coffee', jarCode: 'NEC', isCustom: true },
    { id: 'custom-play', name: 'Chi chung', type: 'expense', icon: 'gift', jarCode: 'PLAY', isCustom: true },
    { id: 'custom-retired', name: 'Danh mục hũ cũ', type: 'expense', icon: 'tag', jarCode: 'REMOVED_JAR', isCustom: true },
  ];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      const categories = validateCustomCategories(body.customCategories);
      const finance = validateAndNormalizeUserData(body, fixture.finance() as unknown as Record<string, unknown>);
      if (categories.error || finance.error) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: categories.error || finance.error }) });
    }
    return route.fallback();
  });
  return fixture;
}

test('all jars share defaults and legacy custom categories; selection keeps the exact ID through jar changes, edits and reload', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await setup(page, vi);
  const play = fixture.finance().jars.find(jar => jar.code === 'PLAY')!;
  const nec = fixture.finance().jars.find(jar => jar.code === 'NEC')!;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: vi ? 'Giao dịch' : 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Ghi Nhận Giao Dịch Mới' : 'New transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('[data-ui="category-picker"]');
  await picker.locator('[data-ui="category-picker-trigger"]').click();
  await expect(picker.locator('[data-category-id="default-expense-edu-tuition"]')).toBeVisible();
  await expect(picker.locator('[data-category-id="custom-retired"]')).toBeVisible();
  await expect(picker.locator('[data-category-id="custom-nec"]')).toHaveCount(1);
  await picker.locator('[data-category-id="custom-play"]').getByRole('button').first().click();
  const jars = dialog.locator('select').filter({ has: page.locator(`option[value="${play.id}"]`) }).first();
  await jars.selectOption(play.id);
  await expect(picker.locator('[data-ui="category-picker-trigger"]')).toContainText('Chi chung');
  await dialog.locator('#transaction-amount').fill('30000');
  await dialog.locator('input[maxlength="500"]').fill('Shared category saved');
  await dialog.getByRole('button', { name: vi ? 'Lưu Giao Dịch' : 'Save Transaction', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Shared category saved')?.categoryId).toBe('custom-play');
  expect(fixture.finance().transactions.find(tx => tx.description === 'Shared category saved')?.categoryIcon).toBe('gift');
  await page.reload(); await page.getByRole('button', { name: vi ? 'Giao dịch' : 'Transactions', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Shared category saved' }).getByRole('button').first().click();
  await dialog.locator('select').filter({ has: page.locator(`option[value="${play.id}"]`) }).first().selectOption(nec.id);
  await dialog.getByRole('button', { name: vi ? 'Lưu Thay Đổi' : 'Save Changes', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Shared category saved')?.jarId).toBe(nec.id);
  expect(fixture.finance().transactions.find(tx => tx.description === 'Shared category saved')?.categoryId).toBe('custom-play');
  expect(fixture.finance().customCategories).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('new custom categories are global and editing a renamed category transaction preserves its saved label, ID and icon', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await setup(page, vi);
  const finance = fixture.finance();
  finance.transactions[0] = { ...finance.transactions[0], category: 'Tên lưu trước đây', categoryId: 'custom-nec', categoryIcon: 'utensils' };
  await page.goto('/'); await page.getByRole('button', { name: vi ? 'Giao dịch' : 'Transactions', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Synthetic lunch' }).getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('[data-ui="category-picker"]');
  await expect(picker.locator('[data-ui="category-picker-trigger"]')).toContainText('Tên lưu trước đây');
  await dialog.locator('input[maxlength="500"]').fill('Edited description only');
  await dialog.getByRole('button', { name: vi ? 'Lưu Thay Đổi' : 'Save Changes', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions[0].description).toBe('Edited description only');
  expect(fixture.finance().transactions[0]).toMatchObject({ category: 'Tên lưu trước đây', categoryId: 'custom-nec', categoryIcon: 'utensils' });
  await page.getByRole('button', { name: vi ? 'Ghi Nhận Giao Dịch Mới' : 'New transaction', exact: true }).click();
  await picker.locator('[data-ui="category-picker-trigger"]').click();
  await picker.getByRole('button', { name: vi ? 'Thêm danh mục của riêng bạn' : 'Add your own category', exact: true }).click();
  await expect(picker.getByText(vi ? 'Áp dụng cho tất cả hũ và chi tiêu ngoài hũ' : 'Available in every jar and for expenses outside jars', { exact: true })).toBeVisible();
  await picker.getByLabel(vi ? 'Tên danh mục' : 'Category name', { exact: true }).fill('Danh mục dùng chung mới');
  await picker.getByRole('button', { name: vi ? 'Tạo và chọn danh mục' : 'Create and select category', exact: true }).click();
  await expect.poll(() => fixture.finance().customCategories.find(category => category.name === 'Danh mục dùng chung mới')?.id).toMatch(/^custom-/);
  const created = fixture.finance().customCategories.find(category => category.name === 'Danh mục dùng chung mới')!;
  expect(created.jarCode).toBeUndefined();
  const play = finance.jars.find(jar => jar.code === 'PLAY')!;
  await dialog.locator('select').filter({ has: page.locator(`option[value="${play.id}"]`) }).first().selectOption(play.id);
  await expect(picker.locator('[data-ui="category-picker-trigger"]')).toContainText('Danh mục dùng chung mới');
  await dialog.locator('#transaction-amount').fill('40000');
  await dialog.locator('input[maxlength="500"]').fill('New global category');
  await dialog.getByRole('button', { name: vi ? 'Lưu Giao Dịch' : 'Save Transaction', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'New global category')?.categoryId).toBe(created.id);
});

test('bulk rows and statement import can select categories from other or retired jars and keep them when changing jars', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await setup(page, vi);
  const data = fixture.finance();
  const nec = data.jars.find(jar => jar.code === 'NEC')!;
  const play = data.jars.find(jar => jar.code === 'PLAY')!;
  data.jars[0] = { ...nec, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST' };
  data.bankAccounts = [{ id: 'bank-statement', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  await page.goto('/'); await page.getByRole('button', { name: vi ? 'Giao dịch' : 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Ghi hàng loạt' : 'Bulk entry', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(vi ? 'Số tiền' : 'Amount', { exact: true }).fill('20000');
  await dialog.getByLabel(vi ? 'Diễn giải' : 'Description', { exact: true }).fill('Shared bulk row');
  const categorySelect = dialog.locator('select').filter({ has: page.locator('option[value="custom-retired"]') });
  const jarSelect = dialog.locator('select').filter({ has: page.locator(`option[value="${play.id}"]`) });
  await categorySelect.selectOption('custom-retired');
  await jarSelect.selectOption(play.id);
  await expect(categorySelect).toHaveValue('custom-retired');
  await dialog.getByRole('button', { name: /^(Xác nhận|Confirm) 1$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Shared bulk row')?.categoryId).toBe('custom-retired');
  await page.getByRole('button', { name: vi ? 'Nhập sao kê' : 'Import statement', exact: true }).click();
  const date = data.transactions[0].date;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Date', 'Description', 'Debit', 'Credit', 'Reference'], [date, 'Shared statement row', 10000, '', 'shared-reference'],
  ]), 'Statement');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) });
  const category = dialog.locator('select').filter({ has: page.locator('option[value="custom-retired"]') });
  await expect(category.locator('option[value="custom-play"]')).toHaveCount(1);
  await category.selectOption('custom-play');
  await dialog.locator('select').filter({ has: page.locator(`option[value="${nec.id}"]`) }).selectOption(nec.id);
  await expect(category).toHaveValue('custom-play');
  await dialog.getByRole('button', { name: vi ? 'Chọn dòng hợp lệ' : 'Select clear rows', exact: true }).click();
  await dialog.getByRole('button', { name: /^(Xác nhận|Confirm) 1$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Shared statement row')?.categoryId).toBe('custom-play');
});
