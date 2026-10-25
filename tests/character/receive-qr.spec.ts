import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';

test('receive QR prefills this cycle limit, permits editing, resets on reopen and uses each jar independently without financial writes', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance();
  data.jars = data.jars.map(jar => jar.code === 'NEC' || jar.code === 'SAFE' ? {
    ...jar, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'SYNTHETIC',
    cycleAllocation: jar.code === 'NEC' ? 2000000 : 1000000,
    targetBudget: (jar.code === 'NEC' ? 2000000 : 1000000) + 300000,
    carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 300000 }],
  } : jar);
  data.bankAccounts = [{ id: 'bank-test', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'SYNTHETIC',
    balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  await page.waitForTimeout(1000);
  const original = structuredClone(fixture.finance()), writes = fixture.writes();
  const dialog = page.getByRole('dialog', { name: vi ? 'QR Nhận Tiền Vào Hũ' : 'Receive Money into Jar', exact: true });
  const field = () => dialog.getByRole('textbox', { name: vi ? 'Số tiền chuyển vào hũ' : 'Amount to transfer into jar', exact: true });
  const open = (code: string) => page.locator(`#managed-jar-jar-${code.toLowerCase()}`).getByRole('button', { name: vi ? 'QR nhận tiền' : 'Receive QR', exact: true }).click();
  await open('NEC');
  await expect(field()).toHaveValue(vi ? '2.000.000' : '2,000,000');
  const initialQR = await dialog.locator('#receive-vietqr-code path').last().getAttribute('d');
  await field().fill('123456');
  await expect.poll(() => dialog.locator('#receive-vietqr-code path').last().getAttribute('d')).not.toBe(initialQR);
  await dialog.getByRole('button', { name: vi ? 'Đóng' : 'Close', exact: true }).click();
  await open('SAFE');
  await expect(field()).toHaveValue(vi ? '1.000.000' : '1,000,000');
  await dialog.getByRole('button', { name: vi ? 'Đóng' : 'Close', exact: true }).click();
  await open('NEC');
  await expect(field()).toHaveValue(vi ? '2.000.000' : '2,000,000');
  await expect(dialog.locator('#receive-vietqr-code path').last()).toHaveAttribute('d', initialQR!);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await dialog.getByRole('button', { name: vi ? 'Đóng' : 'Close', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Ẩn toàn bộ số tiền' : 'Hide all amounts', exact: true }).click();
  await open('NEC');
  await expect(dialog.locator('input').first()).toHaveAttribute('type', 'password');
  expect(await dialog.innerText()).not.toMatch(/2[.,]000[.,]000/);
  const current = fixture.finance();
  expect(current.jars).toEqual(original.jars); expect(current.bankAccounts).toEqual(original.bankAccounts);
  expect(current.transactions).toEqual(original.transactions); expect(current.monthlySummaries).toEqual(original.monthlySummaries);
  // The privacy switch itself may save preferences; creating/editing QR must not.
  expect(fixture.writes()).toBeLessThanOrEqual(writes + 1);
});

test('a newly confirmed percentage allocation is reflected in the next QR without crediting bank balances', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance();
  data.jars = data.jars.map(jar => jar.code === 'NEC' ? { ...jar, bankCode: 'TCB', bankName: 'Techcombank',
    accountNumber: '123456789', accountName: 'SYNTHETIC' } : jar);
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  await page.waitForTimeout(1000);
  const beforeBank = structuredClone(fixture.finance().bankAccounts), beforeTransactions = structuredClone(fixture.finance().transactions);
  const open = () => page.locator('#managed-jar-jar-nec').getByRole('button', { name: vi ? 'QR nhận tiền' : 'Receive QR', exact: true }).click();
  const qr = page.getByRole('dialog', { name: vi ? 'QR Nhận Tiền Vào Hũ' : 'Receive Money into Jar', exact: true });
  const field = () => qr.getByRole('textbox', { name: vi ? 'Số tiền chuyển vào hũ' : 'Amount to transfer into jar', exact: true });
  await open(); await expect(field()).toHaveValue(vi ? '4.000.000' : '4,000,000');
  await qr.getByRole('button', { name: vi ? 'Đóng' : 'Close', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  const allocation = page.getByRole('dialog', { name: vi ? 'Phân Bổ Hũ Tài Chính Hàng Tháng' : 'Monthly Jar Allocation', exact: true });
  await allocation.locator('#salary-entry-mode').selectOption('budget');
  await allocation.locator('#salary-income-amount').fill('20000000');
  await allocation.getByRole('button', { name: /Apply.*Allocation|Áp Dụng Phân Bổ/i }).click();
  await expect.poll(() => fixture.finance().monthlyIncome).toBe(20000000);
  await open(); await expect(field()).toHaveValue(vi ? '8.000.000' : '8,000,000');
  expect(fixture.finance().bankAccounts).toEqual(beforeBank); expect(fixture.finance().transactions).toEqual(beforeTransactions);
});
