import { test, expect, type Page } from '@playwright/test';
import { characterFixture } from './fixture';
import { validateAndNormalizeUserData } from '../../server/dataValidation';
import { buildJarAllocationSuggestion, parseJarAllocationRequest, type JarAllocationRequest } from '../../shared/jarAllocation';

async function setup(page: Page, vi: boolean) {
  const fixture = await characterFixture(page, { light: vi, language: vi ? 'vi' : 'en' });
  const data = fixture.finance();
  const percentages: Record<string, number> = { NEC: 40, SAFE: 10, FFA: 10, PLAY: 5, GIVE: 5, EDU: 10, DEBT: 20 };
  data.jars = data.jars.map(jar => ({ ...jar, percentage: percentages[jar.code], cycleAllocation: percentages[jar.code] * 100_000,
    targetBudget: percentages[jar.code] * 100_000 + 12345,
    carryovers: [{ sourceCycleStart: '2026-08-25', sourceCycleEnd: '2026-09-24', amount: 12345 }] }));
  data.bankAccounts = [{ id: 'bank-one', bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountHolder: 'SYNTHETIC',
    balance: 1000000, openingBalance: 1000000, balanceReconciled: true, lastSynced: '', status: 'connected', isManuallyAdded: true }];
  data.debtItems = [1, 2].map(index => ({ id: `debt-${index}`, name: `Synthetic debt ${index}`, totalAmount: 12000000,
    remainingAmount: 12000000, monthlyPayment: 1000000, startMonth: '2026-01-01', endMonth: '2026-12-31', status: 'active', calculationMode: 'total' }));
  const rejected: string[] = [];
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'PUT') {
      const checked = validateAndNormalizeUserData(route.request().postDataJSON(), fixture.finance() as unknown as Record<string, unknown>);
      if (!checked.value) { rejected.push(checked.error!); return route.fulfill({ status: 400, json: { error: checked.error } }); }
    }
    return route.fallback();
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Quản lý hũ' : 'Manage jars', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Tự Tính % Hũ DEBT & Quản Lý Nợ' : 'Calculate DEBT % & Manage Debt', exact: true }).click();
  const manager = page.getByRole('dialog', { name: vi ? 'Quản lý nợ & phân bổ hũ' : 'Manage debts & jar allocation', exact: true });
  await expect(manager).toBeVisible();
  const preview = page.getByRole('dialog', { name: vi ? 'Đề xuất phân bổ lại hũ' : 'Jar reallocation proposal', exact: true });
  const review = () => manager.getByRole('button', { name: vi ? 'Xem đề xuất phân bổ' : 'Review allocation proposal', exact: true }).click();
  const select = async (codes: string[]) => {
    for (const button of await manager.locator('[data-select-jar]').all()) {
      const wanted = codes.includes((await button.getAttribute('data-select-jar'))!);
      if ((await button.getAttribute('aria-pressed') === 'true') !== wanted) await button.click();
    }
  };
  await page.waitForTimeout(900);
  return { fixture, manager, preview, review, select, rejected, errors };
}

test('paying two debts never reallocates until a reviewed proposal is explicitly accepted; cancellation and reopen are safe', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, manager, preview, review, select, rejected, errors } = await setup(page, vi);
  const before = structuredClone(fixture.finance());
  for (const index of [1, 2]) {
    await manager.getByRole('button', { name: `${vi ? 'Đánh dấu đã hoàn thành' : 'Mark as paid'} · Synthetic debt ${index}`, exact: true }).click();
    await expect.poll(() => fixture.finance().debtItems[index - 1].status).toBe('paid');
    expect(fixture.finance().jars).toEqual(before.jars);
  }
  await select(['SAFE', 'EDU', 'PLAY']);
  await review(); await expect(preview).toBeVisible();
  await expect(preview.locator('[data-jar-code="DEBT"] strong')).toHaveText('0%');
  expect(fixture.finance().jars).toEqual(before.jars);
  await preview.getByRole('button', { name: vi ? 'Hủy' : 'Cancel', exact: true }).click();
  expect(fixture.finance().jars).toEqual(before.jars);
  await review(); await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0);
  await review();
  await preview.getByRole('button', { name: vi ? 'Xác nhận phân bổ' : 'Confirm allocation', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => fixture.finance().jars.find(jar => jar.code === 'DEBT')!.percentage).toBe(0);
  for (const code of ['NEC', 'GIVE', 'FFA']) expect(fixture.finance().jars.find(jar => jar.code === code)!.percentage).toBe(before.jars.find(jar => jar.code === code)!.percentage);
  for (const jar of fixture.finance().jars) {
    expect(jar.carryovers).toEqual(before.jars.find(item => item.id === jar.id)!.carryovers);
    expect(jar.currentSpent).toBe(before.jars.find(item => item.id === jar.id)!.currentSpent);
  }
  expect(fixture.finance().bankAccounts).toEqual(before.bankAccounts);
  expect(fixture.finance().transactions).toEqual(before.transactions);
  expect(fixture.finance().monthlySummaries).toEqual(before.monthlySummaries);
  expect(rejected).toEqual([]); expect(errors).toEqual([]);
});

test('AI preview works with remaining debts, changes only selected jars, protects exact fixed amounts and applies only after accept', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, manager, preview, review, select, rejected, errors } = await setup(page, vi);
  const originalJars = structuredClone(fixture.finance().jars);
  await manager.locator('[data-debt-id="debt-1"]').getByRole('button', { name: /Mark as paid|Đánh dấu đã hoàn thành/ }).click();
  await expect.poll(() => fixture.finance().debtItems[0].status).toBe('paid');
  await manager.getByRole('checkbox').check();
  await manager.getByRole('textbox', { name: vi ? 'Hạn mức cố định hũ Cho đi' : 'Fixed giving jar limit' }).fill('123456');
  await select(['SAFE', 'EDU', 'PLAY']);
  let request: JarAllocationRequest | null = null;
  await page.route('**/api/ai/jar-allocation', async route => {
    request = parseJarAllocationRequest(route.request().postDataJSON()); expect(request).not.toBeNull();
    expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(['editableCodes', 'jars', 'language']);
    const result = buildJarAllocationSuggestion({ weights: request!.editableCodes.map((code, index) => ({ code, weight: index + 1 })), reason: 'Synthetic AI proposal' }, request!);
    await route.fulfill({ json: result });
  });
  await review();
  await expect(preview.locator('[data-jar-code="NEC"]')).toContainText(vi ? 'Nhu cầu thiết yếu' : 'Essential Needs');
  await preview.getByRole('button', { name: vi ? 'Nhờ AI đề xuất' : 'Ask AI to suggest', exact: true }).click();
  await expect(preview.getByText('Synthetic AI proposal', { exact: true })).toBeVisible();
  expect(fixture.finance().jars).toEqual(originalJars);
  expect(request!.jars.find(jar => jar.code === 'DEBT')!.percentage).toBe(10);
  expect(request!.editableCodes.sort()).toEqual(['EDU', 'PLAY', 'SAFE']);
  await preview.getByRole('button', { name: vi ? 'Xác nhận phân bổ' : 'Confirm allocation', exact: true }).click();
  await expect.poll(() => fixture.finance().jars.find(jar => jar.code === 'DEBT')!.percentage).toBe(10);
  expect(fixture.finance().jars.find(jar => jar.code === 'GIVE')!.cycleAllocation).toBe(123456);
  expect(fixture.finance().jars.find(jar => jar.code === 'NEC')!.percentage).toBe(40);
  expect(fixture.finance().jars.find(jar => jar.code === 'FFA')!.percentage).toBe(10);
  expect(rejected).toEqual([]); expect(errors).toEqual([]);
});

test('invalid or unavailable AI does not change stored allocation; preview is responsive and private', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, manager, preview, review, errors } = await setup(page, vi);
  const original = structuredClone(fixture.finance().jars);
  await page.route('**/api/ai/jar-allocation', route => route.fulfill({ json: { success: true, allocation: { DEBT: 0, FFA: 100 }, reason: 'Forged missing jars' } }));
  await review();
  await preview.getByRole('button', { name: vi ? 'Nhờ AI đề xuất' : 'Ask AI to suggest', exact: true }).click();
  await expect(preview.getByRole('alert')).toBeVisible();
  expect(fixture.finance().jars).toEqual(original);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    const bounds = await preview.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(preview.getByRole('button', { name: vi ? 'Xác nhận phân bổ' : 'Confirm allocation' })).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('allocation-preview.png'), fullPage: true });
  await preview.getByRole('button', { name: vi ? 'Đóng đề xuất' : 'Close proposal', exact: true }).click();
  await manager.getByRole('button', { name: vi ? 'Đóng quản lý nợ' : 'Close debt management', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Ẩn toàn bộ số tiền' : 'Hide all amounts', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Tự Tính % Hũ DEBT & Quản Lý Nợ' : 'Calculate DEBT % & Manage Debt', exact: true }).click();
  await review();
  await expect(preview.locator('[data-jar-code="NEC"]')).toContainText('••••');
  expect(await preview.innerText()).not.toMatch(/4[.,]000[.,]000/);
  expect(fixture.finance().jars).toEqual(original); expect(errors).toEqual([]);
});

test('adding and deleting debts preserves rates; invalid income or no selection cannot produce a zeroed proposal', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, manager, select, rejected } = await setup(page, vi);
  const original = structuredClone(fixture.finance().jars);
  await manager.getByRole('button', { name: `${vi ? 'Xóa khoản nợ' : 'Delete debt'} · Synthetic debt 1`, exact: true }).click();
  await expect.poll(() => fixture.finance().debtItems.length).toBe(1);
  expect(fixture.finance().jars).toEqual(original);
  await manager.getByRole('button', { name: vi ? 'Thêm khoản nợ mới' : 'Add Debt', exact: true }).click();
  const form = manager.locator('form');
  await form.locator('input[type="text"]').first().fill('Synthetic added debt');
  // Total-debt mode has exactly one currency input before dates/fees.
  await form.locator('input[inputmode="numeric"]').first().fill('1200000');
  await form.getByRole('button', { name: vi ? 'Lưu Khoản Nợ Mới' : 'Save Debt', exact: true }).click();
  await expect.poll(() => fixture.finance().debtItems.length).toBe(2);
  expect(fixture.finance().jars).toEqual(original);
  await select([]);
  await expect(manager.getByRole('button', { name: vi ? 'Xem đề xuất phân bổ' : 'Review allocation proposal', exact: true })).toBeDisabled();
  await select(['SAFE']);
  await manager.getByRole('checkbox').check();
  await manager.getByRole('textbox', { name: vi ? 'Hạn mức cố định hũ Cho đi' : 'Fixed giving jar limit' }).fill('');
  await expect(manager.getByRole('button', { name: vi ? 'Xem đề xuất phân bổ' : 'Review allocation proposal', exact: true })).toBeDisabled();
  await manager.getByRole('textbox', { name: vi ? 'Hạn mức cố định hũ Cho đi' : 'Fixed giving jar limit' }).fill('100000');
  await expect(manager.getByRole('button', { name: vi ? 'Xem đề xuất phân bổ' : 'Review allocation proposal', exact: true })).toBeEnabled();
  expect(rejected).toEqual([]);
});

test('cancelling an in-flight AI proposal discards its late result and reopening starts from current data', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, preview, review } = await setup(page, vi);
  const original = structuredClone(fixture.finance().jars);
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/api/ai/jar-allocation', async route => {
    const input = parseJarAllocationRequest(route.request().postDataJSON())!;
    requested = true; await gate;
    const result = buildJarAllocationSuggestion({ weights: input.editableCodes.map(code => ({ code, weight: 1 })), reason: 'Late synthetic response' }, input);
    await route.fulfill({ json: result }).catch(() => {});
  });
  await review();
  await preview.getByRole('button', { name: vi ? 'Nhờ AI đề xuất' : 'Ask AI to suggest', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(preview.getByRole('button', { name: vi ? 'Xác nhận phân bổ' : 'Confirm allocation' })).toBeDisabled();
  await preview.getByRole('button', { name: vi ? 'Hủy' : 'Cancel', exact: true }).click();
  release(); await review();
  await expect(preview.getByText('Late synthetic response')).toHaveCount(0);
  expect(fixture.finance().jars).toEqual(original);
});

test('a concurrent server revision cannot be overwritten by accepting an older proposal', async ({ page }, info) => {
  const vi = info.project.name === 'phone-light';
  const { fixture, preview, review } = await setup(page, vi);
  await review();
  const external = structuredClone(fixture.finance());
  external.monthlyIncome += 1000000;
  fixture.replaceFinanceFromServer(external);
  const rejected = page.waitForResponse(response => response.url().endsWith('/api/data') && response.request().method() === 'PUT' && response.status() === 409);
  await preview.getByRole('button', { name: vi ? 'Xác nhận phân bổ' : 'Confirm allocation', exact: true }).click();
  await rejected;
  expect(fixture.finance()).toEqual(external);
});
