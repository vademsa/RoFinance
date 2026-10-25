import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
import { getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';

test('bank-only receipts survive reload, edits, account changes, backdating and deletion without changing jars', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: info.project.name === 'phone-light' ? 'vi' : 'en' });
  const data = fixture.finance();
  data.jars[0] = { ...data.jars[0], bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST' };
  data.bankAccounts = [
    { id: 'bank-primary', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 0, lastSynced: '', status: 'connected', isManuallyAdded: true },
    { id: 'bank-other', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', accountHolder: 'TEST', balance: 500000, lastSynced: '', status: 'connected', isManuallyAdded: true },
  ];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^(Transactions|Giao dịch)$/ }).click();
  await page.waitForTimeout(1200);
  const before = structuredClone({ jars: fixture.finance().jars, income: fixture.finance().monthlyIncome, accounts: fixture.finance().bankAccounts });
  const baseline = before.accounts.find(account => account.id === 'bank-primary')!.balance;
  await page.getByRole('button', { name: /^(New transaction|Ghi Nhận Giao Dịch Mới)$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(Income|Thu Nhập)$/ }).click();
  await dialog.locator('#income-destination').selectOption('bank');
  await expect(dialog.locator('#income-bank-account option')).toHaveCount(3);
  await expect(dialog.locator('#transaction-payment-method')).toHaveCount(0);
  await dialog.locator('#income-bank-account').selectOption('bank-primary');
  await dialog.locator('#transaction-amount').fill('200000');
  await dialog.locator('input[maxlength="500"]').fill('Bank-only test');
  if (info.project.name === 'desktop-dark') await expect(dialog.getByText('Suggestions based on your input', { exact: true })).toBeVisible();
  await dialog.screenshot({ path: info.outputPath('bank-only-form.png') });
  await dialog.getByRole('button', { name: /^(Save Transaction|Lưu Giao Dịch)$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Bank-only test')?.bankAccountId).toBe('bank-primary');
  await expect.poll(() => fixture.finance().bankAccounts.find(account => account.id === 'bank-primary')?.balance).toBe(baseline + 200000);
  expect(fixture.finance().jars).toEqual(before.jars);
  expect(fixture.finance().monthlyIncome).toBe(before.income);
  expect(fixture.finance().transactions.find(tx => tx.description === 'Bank-only test')?.jarId).toBe('');

  const row = page.getByRole('row').filter({ hasText: 'Bank-only test' });
  await row.getByRole('button').first().click();
  await expect(dialog.locator('#income-destination')).toHaveValue('bank');
  await dialog.locator('#income-bank-account').selectOption('bank-other');
  await dialog.locator('#transaction-amount').fill('300000');
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  await dialog.locator('#transaction-date').fill(previous);
  await dialog.getByRole('button', { name: /^(Save Changes|Lưu Thay Đổi)$/ }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Bank-only test')?.date).toBe(previous);
  await expect.poll(() => fixture.finance().bankAccounts.find(account => account.id === 'bank-other')?.balance).toBe(800000);
  expect(fixture.finance().bankAccounts.find(account => account.id === 'bank-primary')?.balance).toBe(baseline);
  expect(fixture.finance().jars).toEqual(before.jars);
  expect(fixture.finance().monthlySummaries.find(summary => summary.cycleStart === previous)?.income).toBe(300000);
  await page.reload();
  await page.getByRole('button', { name: /^(Transactions|Giao dịch)$/ }).click();
  await page.locator('select').filter({ has: page.locator('option[value="CURRENT_CYCLE"]') }).selectOption('ALL');
  await expect(row).toBeVisible();
  await expect(row.getByRole('button').last()).toBeEnabled();
  await row.getByRole('button').last().click();
  await expect.poll(() => fixture.finance().transactions.some(tx => tx.description === 'Bank-only test')).toBe(false);
  await expect.poll(() => fixture.finance().bankAccounts.find(account => account.id === 'bank-other')?.balance).toBe(500000);
  expect(fixture.finance().monthlySummaries.find(summary => summary.cycleStart === previous)?.income).toBe(0);
  expect(fixture.finance().jars).toEqual(before.jars);
  expect(errors).toEqual([]);
});

test('amount suggestions scale with trailing zeros and a bank-only receipt requires a saved account', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', language: 'vi' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Giao dịch', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi Nhận Giao Dịch Mới', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#transaction-amount').fill('2');
  const suggestions = dialog.locator('[aria-label="Gợi ý số tiền theo giá trị đang nhập"] button');
  await expect(suggestions).toHaveCount(4);
  expect((await suggestions.allTextContents()).map(text => text.replace(/\D/g, ''))).toEqual(['200', '2000', '20000', '200000']);
  await dialog.locator('#transaction-amount').fill('20');
  expect((await suggestions.allTextContents()).map(text => text.replace(/\D/g, ''))).toEqual(['2000', '20000', '200000', '2000000']);
  await suggestions.first().click();
  await expect(dialog.locator('#transaction-amount')).toHaveValue('2.000');
  await dialog.getByRole('button', { name: 'Thu Nhập', exact: true }).click();
  await dialog.locator('#income-destination').selectOption('bank');
  await expect(dialog.locator('#income-bank-account option')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Lưu Giao Dịch', exact: true })).toBeDisabled();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
