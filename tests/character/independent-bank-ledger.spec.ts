import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
import { validateAndNormalizeUserData } from '../../server/dataValidation';

test('personal spending chooses a real account independently; reallocating budgets never changes account money', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const data = fixture.finance();
  data.jars[0] = { ...data.jars[0], bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST' };
  data.bankAccounts = [
    { id: 'bank-personal', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 7000000, openingBalance: 7000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
    { id: 'bank-trade', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', accountHolder: 'TEST', balance: 3000000, openingBalance: 3000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
  ];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const validated = validateAndNormalizeUserData(route.request().postDataJSON(), fixture.finance() as unknown as Record<string, unknown>);
      if (!validated.value) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: validated.error }) });
    }
    return route.fallback();
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: 'New transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#transaction-payment-method').selectOption('bank-trade');
  await dialog.locator('#transaction-amount').fill('200000');
  await dialog.locator('input[maxlength="500"]').fill('Personal paid from trade account');
  await dialog.getByRole('button', { name: 'Save Transaction', exact: true }).click();
  await expect.poll(() => fixture.finance().bankAccounts.find(a => a.id === 'bank-trade')?.balance).toBe(2800000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'bank-personal')?.balance).toBe(7000000);
  expect(fixture.finance().jars[0].currentSpent).toBe(300000);
  const tx = fixture.finance().transactions.find(t => t.description === 'Personal paid from trade account')!;
  expect(tx.jarId).toBe(data.jars[0].id); expect(tx.bankAccountId).toBe('bank-trade');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Manage jars', exact: true }).click();
  await page.getByRole('button', { name: 'Update Income', exact: true }).click();
  await dialog.locator('#salary-entry-mode').selectOption('budget');
  await dialog.locator('#salary-income-amount').fill('20000000');
  await dialog.getByRole('button', { name: /Apply.*Allocation|Áp Dụng Phân Bổ/i }).click();
  await expect.poll(() => fixture.finance().monthlyIncome).toBe(20000000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'bank-personal')?.balance).toBe(7000000);
  expect(fixture.finance().bankAccounts.find(a => a.id === 'bank-trade')?.balance).toBe(2800000);
  await page.reload(); await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Personal paid from trade account' }).getByRole('button').first().click();
  await expect(dialog.locator('#transaction-payment-method')).toHaveValue('bank-trade');
  expect(fixture.finance().bankAccounts.find(a => a.id === 'bank-personal')?.balance).toBe(7000000);
});

test('legacy jar-derived balances are preserved, marked for review, and can be reconciled even for linked accounts', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const data = fixture.finance();
  data.jars[0] = { ...data.jars[0], bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'TEST' };
  data.bankAccounts = [{ id: 'old-bank', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST', balance: 6000000, lastSynced: '', status: 'connected', isManuallyAdded: false }];
  await page.route('**/api/bank/balance', async route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, newBalance: route.request().postDataJSON().balance, lastSynced: 'Confirmed' }) }));
  await page.goto('/'); await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.getByText(/^Confirm actual balance:/)).toBeVisible();
  await expect.poll(() => fixture.finance().bankAccounts[0].openingBalance).toBe(6000000);
  expect(fixture.finance().bankAccounts[0].balance).toBe(6000000);
  const before = structuredClone(fixture.finance().jars);
  const card = page.getByRole('article').filter({ hasText: '123456789' });
  await card.locator('input').fill('5000000');
  await card.getByRole('button').click();
  await expect.poll(() => fixture.finance().bankAccounts[0].balance).toBe(5000000);
  await expect.poll(() => fixture.finance().bankAccounts[0].balanceReconciled).toBe(true);
  expect(fixture.finance().jars).toEqual(before);
  await page.reload(); await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.getByText(/^Confirm actual balance:/)).toHaveCount(0);
  expect(fixture.finance().bankAccounts[0].balance).toBe(5000000);
});
