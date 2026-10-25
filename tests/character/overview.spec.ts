import { test, expect, type Page } from '@playwright/test';
import { characterFixture } from './fixture';
import { getFinancialCycleStart, getPreviousFinancialCycleStart, toLocalDateKey } from '../../src/utils/monthlyCycle';
import { validateAndNormalizeUserData } from '../../server/dataValidation';

async function setup(page: Page, vi: boolean) {
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance(), base = data.transactions[0], jarId = base.jarId;
  const today = base.date;
  const current = getFinancialCycleStart(new Date(), 25);
  const previous = toLocalDateKey(getPreviousFinancialCycleStart(new Date(), 25));
  const oldEnd = new Date(current); oldEnd.setDate(oldEnd.getDate() - 1);
  data.bankAccounts = [{ id: 'bank-one', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'TEST',
    balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true },
  { id: 'bank-two', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '987654321', accountHolder: 'TEST',
    balance: 2000000, openingBalance: 2000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  data.transactions = [
    { ...base, id: 'expense-personal', amount: 20000, category: 'Custom breakfast', categoryId: 'custom-breakfast', description: 'Synthetic breakfast', bankAccountId: 'bank-one', paymentMethodCode: 'TCB' },
    { ...base, id: 'expense-business', jarId: '', amount: 30000, category: 'Custom supplies', categoryId: 'custom-supplies', description: 'Synthetic business', bankAccountId: 'bank-one', paymentMethodCode: 'TCB' },
    { ...base, id: 'income-business', type: 'income', jarId: '', amount: 50000, description: 'Synthetic receipt', bankAccountId: 'bank-two', paymentMethodCode: 'VCB' },
    { ...base, id: 'income-allocated', type: 'income', amount: 100000, description: 'Synthetic allocated', allocations: [{ jarId, amount: 40000 }, { jarId: data.jars[1].id, amount: 60000 }] },
    { ...base, id: 'transfer', type: 'transfer', amount: 7777777, transferToJarId: data.jars[1].id, description: 'Synthetic excluded transfer' },
    { ...base, id: 'old-expense', date: previous, amount: 70000, description: 'Synthetic previous expense', bankAccountId: 'bank-one', paymentMethodCode: 'TCB' },
    { ...base, id: 'old-income', type: 'income', date: previous, jarId: '', amount: 90000, description: 'Synthetic previous receipt', bankAccountId: 'bank-two', paymentMethodCode: 'VCB' },
  ];
  data.monthlySummaries = [{ id: previous, cycleStart: previous, cycleEnd: toLocalDateKey(oldEnd), income: 9999999, expense: 70000,
    transactionCount: 2, spendingByJar: [{ jarId, amount: 70000 }], createdAt: new Date().toISOString() }];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const checked = validateAndNormalizeUserData(route.request().postDataJSON(), fixture.finance() as unknown as Record<string, unknown>);
      if (!checked.value) return route.fulfill({ status: 400, json: { error: checked.error } });
    }
    return route.fallback();
  });
  await page.goto('/'); await expect(page.getByRole('heading', { name: vi ? 'Tổng quan' : 'Overview', exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  return { fixture, today, previous, writes: fixture.writes(), original: structuredClone(fixture.finance()) };
}

test('overview totals, scope/account filters, calendar and old cycles remain read-only and separate bank money from jar limits', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, today, previous, writes, original } = await setup(page, vi);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const metrics = page.getByRole('region', { name: vi ? 'Tóm tắt chu kỳ' : 'Cycle summary', exact: true });
  const numeric = async (key: string) => (await page.locator(`[data-metric="${key}"]`).innerText()).replace(/\D/g, '');
  expect(await numeric('income')).toBe('150000'); expect(await numeric('expense')).toBe('50000');
  expect(await numeric('bank')).toBe('3020000');
  const remaining = await numeric('budget'); expect(Number(remaining)).toBeGreaterThan(9000000);
  const daily = page.getByRole('region', { name: vi ? 'Giao dịch trong ngày' : 'Selected day transactions', exact: true });
  await expect(daily.getByRole('listitem')).toHaveCount(4);
  await expect(daily.getByText('Synthetic excluded transfer', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: vi ? 'Ngoài hũ' : 'Outside jars', exact: true }).click();
  expect(await numeric('income')).toBe('50000'); expect(await numeric('expense')).toBe('30000');
  expect(await numeric('bank')).toBe('3020000'); expect(await numeric('budget')).toBe(remaining);
  await expect(daily.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('combobox', { name: vi ? 'Tài khoản lọc giao dịch' : 'Transaction account filter', exact: true }).selectOption('account:bank-one');
  expect(await numeric('income')).toBe('0'); expect(await numeric('expense')).toBe('30000');
  await expect(daily.getByRole('listitem')).toHaveCount(1);
  await expect(daily.getByText('Synthetic business', { exact: true })).toBeVisible();
  const day = page.locator(`[data-date="${today}"]`);
  await expect(day).toHaveAttribute('aria-label', /30[.,]000/);
  await page.locator('#dashboard-cycle').selectOption(previous);
  expect(await numeric('income')).toBe('0'); expect(await numeric('expense')).toBe('0');
  expect(await numeric('bank')).toBe('3020000');
  await expect(metrics.locator('[data-metric="budget"]')).toHaveText('—');
  await page.getByRole('button', { name: vi ? 'Tất cả' : 'All', exact: true }).click();
  await page.getByRole('combobox', { name: vi ? 'Tài khoản lọc giao dịch' : 'Transaction account filter', exact: true }).selectOption('ALL');
  expect(await numeric('income')).toBe('90000'); expect(await numeric('expense')).toBe('70000');
  await page.getByRole('button', { name: vi ? 'Tháng trước trong chu kỳ' : 'Previous month in cycle', exact: true }).click();
  await page.locator(`[data-date="${previous}"]`).click();
  await expect(daily.getByText('Synthetic previous expense', { exact: true })).toBeVisible();
  await expect(daily.getByText('Synthetic previous receipt', { exact: true })).toBeVisible();
  await page.locator('#dashboard-cycle').selectOption('CURRENT');
  expect(await numeric('income')).toBe('150000');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('overview.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('overview-viewport.png') });
  expect(fixture.writes()).toBe(writes); expect(fixture.finance()).toEqual(original); expect(errors).toEqual([]);
});

test('calendar add-income preserves the selected backdate and edit updates the original transaction, not a duplicate', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, previous } = await setup(page, vi);
  const originalJars = structuredClone(fixture.finance().jars);
  await page.locator('#dashboard-cycle').selectOption(previous);
  await page.getByRole('button', { name: vi ? 'Tháng trước trong chu kỳ' : 'Previous month in cycle', exact: true }).click();
  await page.locator(`[data-date="${previous}"]`).click();
  await page.getByRole('button', { name: vi ? 'Ghi thu' : 'Add income', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('#transaction-date')).toHaveValue(previous);
  await expect(dialog.locator('#income-destination')).toBeVisible();
  await dialog.locator('#income-destination').selectOption('bank');
  await dialog.locator('#income-bank-account').selectOption('bank-one');
  await dialog.locator('#transaction-amount').fill('123000');
  await dialog.locator('input[maxlength="500"]').fill('Synthetic backdate from overview');
  await dialog.getByRole('button', { name: vi ? 'Lưu Giao Dịch' : 'Save Transaction', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.description === 'Synthetic backdate from overview')?.date).toBe(previous);
  const saved = fixture.finance().transactions.find(tx => tx.description === 'Synthetic backdate from overview')!;
  expect(saved.type).toBe('income'); expect(saved.jarId).toBe(''); expect(saved.bankAccountId).toBe('bank-one');
  expect(fixture.finance().jars).toEqual(originalJars);
  const daily = page.getByRole('region', { name: vi ? 'Giao dịch trong ngày' : 'Selected day transactions', exact: true });
  await daily.getByRole('button', { name: `${vi ? 'Chỉnh sửa giao dịch' : 'Edit transaction'} · Synthetic backdate from overview`, exact: true }).click();
  await expect(dialog.locator('#transaction-date')).toHaveValue(previous);
  await dialog.locator('#transaction-amount').fill('124000');
  await dialog.getByRole('button', { name: vi ? 'Lưu Thay Đổi' : 'Save Changes', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions.find(tx => tx.id === saved.id)?.amount).toBe(124000);
  expect(fixture.finance().transactions.filter(tx => tx.description === 'Synthetic backdate from overview')).toHaveLength(1);
  expect(fixture.finance().jars).toEqual(originalJars);
});

test('privacy unmounts chart/progress and masks every amount in overview including calendar aria; language and currency remain correct', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { today } = await setup(page, vi);
  await page.getByRole('button', { name: vi ? 'Ẩn toàn bộ số tiền' : 'Hide all amounts', exact: true }).click();
  const overview = page.locator('[aria-label="' + (vi ? 'Tổng quan tài chính' : 'Financial overview') + '"]');
  await expect(overview.locator('[data-metric]')).toHaveCount(4);
  for (const metric of await overview.locator('[data-metric]').all()) await expect(metric).toContainText('••••');
  await expect(overview.locator('.recharts-wrapper, .recharts-tooltip-wrapper')).toHaveCount(0);
  await expect(overview.locator('[style*="width:"]')).toHaveCount(0);
  await expect(page.locator(`[data-date="${today}"]`)).toHaveAttribute('aria-label', vi ? /Số tiền đã ẩn/ : /Amounts hidden/);
  expect(await overview.innerText()).not.toMatch(/150[.,]000|50[.,]000|3[.,]020[.,]000/);
  await page.getByRole('button', { name: vi ? 'Cài đặt hiển thị' : 'Display Settings', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: 'USD ($)', exact: true }).click();
  await settings.getByRole('button', { name: vi ? 'English' : 'Vietnamese', exact: true }).click();
  await settings.getByRole('button', { name: vi ? 'Close Settings' : 'Đóng cài đặt', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Show all amounts' : 'Hiển thị toàn bộ số tiền', exact: true }).click();
  await expect(page.getByRole('heading', { name: vi ? 'Overview' : 'Tổng quan', exact: true })).toBeVisible();
  await expect(page.locator('[data-metric="income"]')).toContainText('$');
  await expect(page.getByRole('button', { name: vi ? 'Manage jars' : 'Quản lý hũ', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: vi ? 'Transaction calendar' : 'Lịch giao dịch', exact: true })).toBeVisible();
});

test('compact layout fits narrow and wide screens and full jar tools remain available without changing bank money', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture } = await setup(page, vi);
  const beforeBank = structuredClone(fixture.finance().bankAccounts);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const profile = page.getByRole('button', { name: /^(Profile of|Hồ sơ của) / });
    const bounds = await profile.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeLessThan(90);
  }
  await page.getByRole('button', { name: vi ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  await expect(page.getByRole('heading', { name: vi ? 'Quản lý hũ tài chính' : 'Manage financial jars', exact: true })).toBeVisible();
  await page.getByRole('button', { name: vi ? 'Cập Nhật Thu Nhập' : 'Update Income', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.locator('input').first().fill('20000000');
  await dialog.getByRole('button', { name: /Apply.*Allocation|Áp Dụng Phân Bổ/i }).click();
  await expect.poll(() => fixture.finance().monthlyIncome).toBe(20000000);
  expect(fixture.finance().bankAccounts).toEqual(beforeBank);
  await page.getByRole('button', { name: vi ? 'Về tổng quan' : 'Back to overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: vi ? 'Tổng quan' : 'Overview', exact: true })).toBeVisible();
  expect((await page.locator('[data-metric="income"]').innerText()).replace(/\D/g, '')).toBe('150000');
  await page.getByRole('button', { name: vi ? 'Hồ sơ nhân vật' : 'Character profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: vi ? 'Hồ sơ nhân vật' : 'Character profile', exact: true })).toBeVisible();
});

test('daily list paginates real expenses and never substitutes allocation income for missing income records', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance(), base = data.transactions[0];
  data.transactions = Array.from({ length: 12 }, (_, index) => ({ ...base, id: `expense-${String(index).padStart(2, '0')}`, amount: 1000, description: `Synthetic daily ${index}` }));
  await page.goto('/');
  await expect(page.locator('[data-metric="income"]')).toBeVisible();
  expect((await page.locator('[data-metric="income"]').innerText()).replace(/\D/g, '')).toBe('0');
  const daily = page.getByRole('region', { name: vi ? 'Giao dịch trong ngày' : 'Selected day transactions', exact: true });
  await expect(daily.getByRole('listitem')).toHaveCount(5);
  await daily.getByRole('button', { name: vi ? 'Giao dịch tiếp theo' : 'Next transactions', exact: true }).click();
  await expect(daily.getByText('Synthetic daily 5', { exact: true })).toBeVisible();
  await daily.getByRole('button', { name: vi ? 'Giao dịch tiếp theo' : 'Next transactions', exact: true }).click();
  await expect(daily.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: vi ? 'Ngoài hũ' : 'Outside jars', exact: true }).click();
  await expect(daily.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: vi ? 'Tất cả' : 'All', exact: true }).click();
  await expect(daily.getByRole('listitem')).toHaveCount(5);
  await expect(daily.getByText('Synthetic daily 0', { exact: true })).toBeVisible();
});
