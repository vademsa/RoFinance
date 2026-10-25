import { test, expect, type Page } from '@playwright/test';
import { characterFixture } from './fixture';
import { validateAndNormalizeUserData } from '../../server/dataValidation';

async function setup(page: Page, light: boolean, oneAccount = false) {
  const fixture = await characterFixture(page, { light, language: light ? 'vi' : 'en' });
  const data = fixture.finance();
  data.jars = data.jars.slice(0, 3).map((j, i) => ({ ...j, percentage: [40, 30, 30][i],
    bankCode: oneAccount ? 'TCB' : i < 2 ? 'VCB' : '', bankName: oneAccount ? 'Techcombank' : i < 2 ? 'Vietcombank' : '',
    accountNumber: oneAccount ? '123456789' : i < 2 ? '987654321' : '', accountName: 'SYNTHETIC' }));
  data.bankAccounts = [{ id: 'salary-bank', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'SYNTHETIC',
    balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
    ...oneAccount ? [] : [{ id: 'spending-bank', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', accountHolder: 'SYNTHETIC',
      balance: 2000000, openingBalance: 2000000, balanceReconciled: true, lastSynced: '', status: 'connected' as const, isManuallyAdded: true }]];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const result = validateAndNormalizeUserData(route.request().postDataJSON(), fixture.finance() as unknown as Record<string, unknown>);
      if (!result.value) return route.fulfill({ status: 400, json: { error: result.error } });
    }
    return route.fallback();
  });
  const open = async () => {
    await page.getByRole('button', { name: light ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
    await page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  };
  await page.goto('/'); await open();
  return { fixture, open, dialog: page.getByRole('dialog'), save: () => page.getByRole('dialog').getByRole('button', { name: /Apply.*Allocation|Áp Dụng Phân Bổ/i }).click() };
}

test('salary receipt and grouped bank transfers persist; repeat saves/corrections never add the same salary twice', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { fixture, dialog, save } = await setup(page, light);
  await dialog.locator('#salary-bank-account').selectOption('salary-bank');
  await dialog.locator('#salary-income-amount').fill('10000000');
  await save(); await expect(dialog).toBeHidden();
  await expect.poll(() => fixture.finance().monthlyIncome).toBe(10000000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'salary-bank')?.balance).toBe(4000000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'spending-bank')?.balance).toBe(9000000);
  expect(fixture.finance().transactions.filter(t => t.type === 'transfer')).toHaveLength(1);
  const ids = fixture.finance().transactions.map(t => t.id);
  // The management panel is still open after closing the allocation dialog.
  const reopen = () => page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  await reopen(); await expect(dialog.locator('#salary-bank-account')).toHaveValue('salary-bank');
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().transactions.map(t => t.id)).toEqual(ids);
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(13000000);
  await reopen(); await dialog.locator('#salary-income-amount').fill('12000000'); await save();
  await expect(dialog).toBeHidden();
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(15000000);
  await page.reload();
  await page.getByRole('button', { name: light ? 'Giao dịch' : 'Transactions', exact: true }).click();
  const salary = fixture.finance().transactions.find(t => t.salaryCycleStart && t.type === 'income')!;
  const row = page.getByRole('row').filter({ hasText: salary.description });
  await expect(row).toBeVisible(); await expect(row.getByRole('button').last()).toBeDisabled();
  await row.getByRole('button').first().click();
  await expect(dialog.locator('#salary-income-amount')).toHaveValue(light ? '12.000.000' : '12,000,000');
  await expect(dialog.locator('#salary-bank-account')).toHaveValue('salary-bank');
  await expect(dialog.locator('[role=alert]')).toHaveCount(0);
});

test('a single bank account receives full salary; budget-only edits do not move real money', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { fixture, dialog, save } = await setup(page, light, true);
  await dialog.locator('#salary-income-amount').fill('7998545'); await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().bankAccounts[0].balance).toBe(8998545);
  expect(fixture.finance().transactions.filter(t => t.type === 'transfer')).toHaveLength(0);
  const before = structuredClone(fixture.finance().transactions);
  await page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  await dialog.locator('#salary-entry-mode').selectOption('budget');
  await dialog.locator('#salary-income-amount').fill('20000000'); await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().monthlyIncome).toBe(7998545);
  expect(fixture.finance().jars.reduce((sum, j) => sum + (j.cycleAllocation || 0), 0)).toBe(20000000);
  expect(fixture.finance().bankAccounts[0].balance).toBe(8998545);
  expect(fixture.finance().transactions).toEqual(before);
});

test('recording and correcting salary preserves separately recorded personal and business receipts', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { fixture, dialog, save } = await setup(page, light);
  // Hydrate additional receipts, then open the current salary form again.
  const data = fixture.finance();
  const extra = { id: 'extra-personal', type: 'income' as const, jarId: data.jars[0].id, bankAccountId: 'salary-bank',
    amount: 200000, category: 'Thưởng', description: 'Synthetic extra income', date: data.transactions[0].date,
    paymentMethodCode: 'TCB', bankName: 'Techcombank', allocations: [{ jarId: data.jars[0].id, amount: 200000 }] };
  const business = { ...extra, id: 'business-receipt', jarId: '', allocations: undefined, description: 'Synthetic business income', amount: 300000 };
  data.transactions.push(extra, business);
  await page.reload();
  await page.getByRole('button', { name: light ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  await page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  await dialog.locator('#salary-bank-account').selectOption('salary-bank');
  await dialog.locator('#salary-income-amount').fill('10000000'); await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().monthlyIncome).toBe(10200000);
  expect(fixture.finance().jars[0].cycleAllocation).toBe(4200000);
  const total = fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  expect(total).toBe(13500000);
  await page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().monthlyIncome).toBe(10200000);
  expect(fixture.finance().jars[0].cycleAllocation).toBe(4200000);
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(total);
  expect(fixture.finance().transactions.find(t => t.id === extra.id)).toEqual(extra);
  expect(fixture.finance().transactions.find(t => t.id === business.id)).toEqual(business);
});

test('failed salary save keeps the form and balances intact; retry records salary only once', async ({ page }, info) => {
  const { fixture, dialog, save } = await setup(page, info.project.name === 'phone-light');
  let reject = true;
  await page.route('**/api/data', async route => {
    if (reject && route.request().method() === 'PUT' &&
      route.request().postDataJSON().transactions.some((t: { salaryCycleStart?: string }) => t.salaryCycleStart)) {
      reject = false;
      return route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } });
    }
    return route.fallback();
  });
  await dialog.locator('#salary-bank-account').selectOption('salary-bank');
  await dialog.locator('#salary-income-amount').fill('10000000');
  await save();
  await expect(dialog.getByRole('alert')).toHaveText('Synthetic save failure');
  expect(fixture.finance().transactions.filter(t => t.salaryCycleStart)).toHaveLength(0);
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(3000000);
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().transactions.filter(t => t.salaryCycleStart && t.type === 'income')).toHaveLength(1);
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(13000000);
});

test('untracked salary source credits allocated accounts directly, validates unlinked money and restores the mode on reopen', async ({ page }, info) => {
  const light = info.project.name === 'phone-light';
  const { fixture, dialog, save } = await setup(page, light);
  await dialog.locator('#salary-income-amount').fill('10000000');
  await dialog.locator('#salary-bank-account').selectOption('');
  await save();
  await expect(dialog.getByRole('alert')).toContainText(light ? 'Hũ chưa liên kết' : 'Select a receiving account');
  expect(fixture.finance().transactions.some(t => t.salaryCycleStart)).toBe(false);
  await dialog.locator('#salary-unlinked-account').selectOption('salary-bank');
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().bankAccounts).toHaveLength(2);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'salary-bank')?.balance).toBe(4000000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'spending-bank')?.balance).toBe(9000000);
  const receipts = fixture.finance().transactions.filter(t => t.salaryCycleStart);
  expect(receipts).toHaveLength(2);
  expect(receipts.every(t => t.type === 'income' && t.salarySource === 'external')).toBe(true);
  expect(receipts.reduce((sum, t) => sum + t.amount, 0)).toBe(10000000);
  await page.reload();
  await page.getByRole('button', { name: light ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  const reopen = () => page.getByRole('button', { name: light ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  await reopen();
  await expect(dialog.locator('#salary-bank-account')).toHaveValue('');
  await expect(dialog.locator('#salary-income-amount')).toHaveValue(light ? '10.000.000' : '10,000,000');
  await expect(dialog.locator('#salary-unlinked-account')).toHaveValue('salary-bank');
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().transactions.filter(t => t.salaryCycleStart)).toEqual(receipts);
  await reopen(); await dialog.locator('#salary-bank-account').selectOption('salary-bank');
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().transactions.filter(t => t.salaryCycleStart && t.type === 'income')).toHaveLength(1);
  expect(fixture.finance().transactions.filter(t => t.type === 'transfer')).toHaveLength(1);
  expect(fixture.finance().bankAccounts.reduce((sum, a) => sum + a.balance, 0)).toBe(13000000);
});

test('untracked salary sent to one allocated account is one direct receipt with no extra account or transfer', async ({ page }, info) => {
  const { fixture, dialog, save } = await setup(page, info.project.name === 'phone-light', true);
  await dialog.locator('#salary-bank-account').selectOption('');
  await expect(dialog.locator('#salary-unlinked-account')).toHaveCount(0);
  await dialog.locator('#salary-income-amount').fill('7998545');
  await save(); await expect(dialog).toBeHidden();
  expect(fixture.finance().bankAccounts).toHaveLength(1);
  expect(fixture.finance().bankAccounts[0].balance).toBe(8998545);
  expect(fixture.finance().transactions.filter(t => t.type === 'transfer')).toHaveLength(0);
  expect(fixture.finance().transactions.filter(t => t.salaryCycleStart)).toHaveLength(1);
  expect(fixture.finance().monthlyIncome).toBe(7998545);
});
