import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
import { getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';
import { validateAndNormalizeUserData } from '../../server/dataValidation';

test('bank expenses save, edit, move accounts/backdate and delete without touching jars', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: info.project.name === 'phone-light' ? 'vi' : 'en' });
  const data = fixture.finance();
  data.jars[0] = { ...data.jars[0], bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST' };
  data.bankAccounts = [
    { id: 'bank-shared', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 5000000, openingBalance: 5000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
    { id: 'bank-business', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', accountHolder: 'TEST', balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
  ];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const validation = validateAndNormalizeUserData(route.request().postDataJSON(), fixture.finance() as unknown as Record<string, unknown>);
      if (!validation.value) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: validation.error }) });
    }
    return route.fallback();
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^(Transactions|Giao dịch)$/ }).click();
  await page.waitForTimeout(1000);
  const before = structuredClone(fixture.finance());
  const baseline = before.bankAccounts.find(a => a.id === 'bank-shared')!.balance;
  await page.getByRole('button', { name: /^(New transaction|Ghi Nhận Giao Dịch Mới)$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#expense-destination').selectOption('bank');
  await dialog.locator('#expense-bank-account').selectOption('bank-shared');
  await expect(dialog.locator('#transaction-payment-method')).toHaveCount(0);
  await dialog.locator('#transaction-amount').fill('200000');
  await dialog.locator('input[maxlength="500"]').fill('Business purchase');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: /^(Save Transaction|Lưu Giao Dịch)$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(t => t.description === 'Business purchase')?.bankAccountId).toBe('bank-shared');
  await expect.poll(() => fixture.finance().bankAccounts.find(a => a.id === 'bank-shared')?.balance).toBe(baseline - 200000);
  expect(fixture.finance().jars).toEqual(before.jars); expect(fixture.finance().monthlyIncome).toBe(before.monthlyIncome);
  const row = page.getByRole('row').filter({ hasText: 'Business purchase' });
  await expect(row.getByText(/^(Outside jars|Ngoài hũ)$/)).toBeVisible();
  await expect(row.getByRole('button').first()).toBeEnabled();
  await row.getByRole('button').first().click();
  await expect(dialog.locator('#expense-destination')).toHaveValue('bank');
  await dialog.locator('#expense-bank-account').selectOption('bank-business');
  await dialog.locator('#transaction-amount').fill('300000');
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  await dialog.locator('#transaction-date').fill(previous);
  await dialog.getByRole('button', { name: /^(Save Changes|Lưu Thay Đổi)$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(t => t.description === 'Business purchase')?.date).toBe(previous);
  await expect.poll(() => fixture.finance().bankAccounts.find(a => a.id === 'bank-shared')?.balance).toBe(baseline);
  await expect.poll(() => fixture.finance().bankAccounts.find(a => a.id === 'bank-business')?.balance).toBe(700000);
  expect(fixture.finance().jars).toEqual(before.jars);
  const summary = fixture.finance().monthlySummaries.find(s => s.cycleStart === previous)!;
  expect(summary.expense).toBe(300000); expect(summary.unallocatedExpense).toBe(300000); expect(summary.jarBreakdown).toEqual([]);
  await page.reload(); await page.getByRole('button', { name: /^(Transactions|Giao dịch)$/ }).click();
  await page.locator('select').filter({ has: page.locator('option[value="CURRENT_CYCLE"]') }).selectOption('ALL');
  await expect(row.getByRole('button').last()).toBeEnabled();
  await row.getByRole('button').last().click();
  await expect.poll(() => fixture.finance().transactions.some(t => t.description === 'Business purchase')).toBe(false);
  await expect.poll(() => fixture.finance().bankAccounts.find(a => a.id === 'bank-business')?.balance).toBe(1000000);
  expect(fixture.finance().monthlySummaries.find(s => s.cycleStart === previous)?.expense).toBe(0);
  expect(fixture.finance().jars).toEqual(before.jars); expect(errors).toEqual([]);
});

test('an expense can change between jar and bank mode without double debiting', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const data = fixture.finance();
  data.bankAccounts = [{ id: 'bank-business', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  data.transactions.push({ id: 'business-mode-switch', type: 'expense', amount: 200000, date: data.transactions[0].date, jarId: '', bankAccountId: 'bank-business', category: 'Khác', description: 'Mode switch test', paymentMethodCode: 'TCB', bankName: 'Techcombank' });
  await page.goto('/'); await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.waitForTimeout(1000);
  const before = structuredClone(fixture.finance().jars);
  const row = page.getByRole('row').filter({ hasText: 'Mode switch test' });
  await row.getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#expense-destination').selectOption('jar');
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(t => t.id === 'business-mode-switch')?.jarId).not.toBe('');
  await expect.poll(() => fixture.finance().bankAccounts[0].balance).toBe(800000);
  await expect.poll(() => fixture.finance().jars[0].currentSpent).toBe(before[0].currentSpent + 200000);
  await row.getByRole('button').first().click(); await dialog.locator('#expense-destination').selectOption('bank');
  await dialog.locator('#expense-bank-account').selectOption('bank-business');
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(t => t.id === 'business-mode-switch')?.jarId).toBe('');
  await expect.poll(() => fixture.finance().bankAccounts[0].balance).toBe(800000);
  expect(fixture.finance().jars).toEqual(before);
});
