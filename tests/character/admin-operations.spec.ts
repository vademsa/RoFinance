import { test, expect, type Page } from '@playwright/test';
import { COSMETICS, ITEM_SLOTS } from '../../shared/character';
import type { AdminOverview, AdminAccount } from '../../shared/admin';

const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', displayName: 'Owner fixture', createdAt: '2026-10-11T05:00:00Z', isOwner: true, hasCharacter: true };
const target: AdminAccount = { ...owner, id: '22222222-2222-4222-8222-222222222222', email: 'user@example.test', displayName: '<script>fixture</script>', isOwner: false };
const overview: AdminOverview = { version: 1, mode: 'read-only', operationsEnabled: true, generatedAt: owner.createdAt,
  counts: { accounts: 25, characters: 20, rankingParticipants: 3, drawsLast7Days: 27 },
  catalogue: { total: COSMETICS.length, prizes: COSMETICS.filter(item => !item.starter).length, signature: 7, hidden: 7 },
  release: { apiRevision: 'a'.repeat(64), webRevision: '11111111-1111-4111-8111-111111111111' } };
async function fixture(page: Page, hasCharacter = true, availablePoints = 140) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const queries: string[] = [];
  let failure = false; let revoked = false; let delay: Promise<void> | null = null;
  let rejection: 'origin' | 'unauthorized' | 'forbidden-null' | null = null;
  await page.context().route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (rejection === 'unauthorized') { await route.fulfill({ status: 401, contentType: 'text/html', body: 'Authentication required' }); return; }
    if (rejection === 'forbidden-null') { await route.fulfill({ status: 403, contentType: 'application/json', body: 'null' }); return; }
    if (revoked) { await route.fulfill({ status: 403, json: { error: 'ADMIN_FORBIDDEN' } }); return; }
    if (path === '/api/admin/overview') { await route.fulfill({ json: overview }); return; }
    if (path === '/api/admin/accounts') {
      queries.push(url.search); const pageNumber = Number(url.searchParams.get('page') ?? 1);
      await route.fulfill({ json: { accounts: pageNumber === 1 ? [owner, { ...target, hasCharacter }] : [{ ...target, email: 'page2@example.test' }], page: pageNumber, pageSize: 12, total: 25 } }); return;
    }
    if (/^\/api\/admin\/accounts\/[^/]+\/inventory$/.test(path)) { await route.fulfill({ json: { targetId: path.split('/')[4], points: { available: hasCharacter ? availablePoints : 0, spent: 20, revoked: 0 }, items: hasCharacter ? [{ itemId: 'shirt-rofinance', copies: 7, equipped: true }, { itemId: COSMETICS.find(item => item.starter)!.id, copies: 1, equipped: false }] : [] } }); return; }
    if (path === '/api/admin/audit') { await route.fulfill({ json: { page: 1, pageSize: 12, total: 1, entries: [{ requestId: '33333333-3333-4333-8333-333333333333', targetId: target.id, kind: 'grant-item', reason: 'Fixture support test', createdAt: owner.createdAt, result: { itemId: 'shirt-rofinance', copies: 7 } }] } }); return; }
    if (path.startsWith('/api/admin/operations/')) {
      const body = req.postDataJSON(); writes.push({ path, body }); if (delay) await delay;
      if (rejection === 'origin') { await route.fulfill({ status: 403, json: { error: 'ADMIN_ORIGIN_REQUIRED' } }); return; }
      if (failure) { await route.abort('failed'); return; }
      await route.fulfill({ json: { requestId: body.requestId, replayed: writes.length > 1, result: {} } }); return;
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Tổng quan hệ thống', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chuyển sang tiếng Anh' }).click();
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await expect(page.locator('.admin-account')).toHaveCount(2);
  return { writes, queries, reject: (value: typeof rejection) => { rejection = value; }, fail: (value: boolean) => { failure = value; }, revoke: () => { revoked = true; }, delay: (value: Promise<void> | null) => { delay = value; } };
}
async function prepare(page: Page, action: string = 'grant-points') {
  await page.locator('.admin-account').filter({ hasText: target.email }).getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption(action);
  await page.getByRole('textbox', { name: 'Reason · 5–300 characters' }).fill('Support test for character rewards');
}
test('admin accounts search pagination audited points/items/revoke confirmation and English/Vietnamese responsive', async ({ page }, info) => {
  const f = await fixture(page);
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.setViewportSize(info.project.use.viewport!);
  await expect(page.getByText('<script>fixture</script>', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find an account' }).fill('user+test@example.test'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => f.queries.at(-1)).toContain('search=user%2Btest%40example.test');
  await page.getByRole('button', { name: 'Next page' }).click(); await expect(page.getByText('page2@example.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await prepare(page); await page.getByRole('textbox', { name: 'Points · 1–100,000' }).fill('120');
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  const modal = page.getByRole('dialog'); await expect(modal).toContainText('120 points'); expect(f.writes.length).toBe(0);
  await page.screenshot({ path: info.outputPath('admin-operation-confirmation.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(f.writes.length).toBe(0);
  await page.screenshot({ path: info.outputPath('admin-account-management.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await modal.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(modal).not.toBeVisible(); expect(f.writes[0].body.points).toBe(120);
  await prepare(page, 'grant-item'); await page.getByRole('combobox', { name: 'Item', exact: true }).selectOption('shirt-rofinance'); await page.getByRole('spinbutton', { name: 'Copies · 1–100' }).fill('7');
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await expect(modal).toContainText(COSMETICS.find(i => i.id === 'shirt-rofinance')!.en);
  await modal.getByRole('button', { name: 'Confirm operation' }).click(); await expect(modal).not.toBeVisible(); expect(f.writes[1].body).toMatchObject({ itemId: 'shirt-rofinance', copies: 7 });
  await prepare(page, 'revoke-sessions'); await page.getByRole('button', { name: 'Review and confirm' }).click(); await modal.getByRole('button', { name: 'Confirm operation' }).click(); await expect(modal).not.toBeVisible(); expect(f.writes[2].path).toContain('revoke-sessions');
  await page.getByRole('button', { name: 'Admin audit trail', exact: true }).click(); await expect(page.getByText('Fixture support test')).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-operations-audit.png'), fullPage: true });
  await page.getByRole('button', { name: 'Accounts', exact: true }).click(); await page.getByRole('button', { name: 'Switch to Vietnamese' }).click(); await expect(page.getByRole('heading', { name: 'Quản lý tài khoản', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('uncertain mutation blocks leaving, survives reauthorization unmount and retries the exact request ID/body', async ({ page }) => {
  const f = await fixture(page); f.fail(true); await prepare(page); await page.getByRole('button', { name: 'Review and confirm' }).click();
  const modal = page.getByRole('dialog'); await modal.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(modal).toContainText('Outcome uncertain'); await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  expect(await page.locator('a.admin-brand').evaluate(element => { const e = new MouseEvent('click', { bubbles: true, cancelable: true }); element.dispatchEvent(e); return e.defaultPrevented; })).toBe(true);
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  const body = f.writes[0].body;
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.admin-account')).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('dialog')).toContainText(String(body.requestId));
  f.fail(false); await page.getByRole('dialog').getByRole('button', { name: 'Retry the same request' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(f.writes).toHaveLength(2); expect(f.writes[1].body).toEqual(body);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeEnabled();
});
test('in-flight result completes while hidden, does not deadlock reopened panel or produce a second write', async ({ page }) => {
  const f = await fixture(page); let release!: () => void; f.delay(new Promise(resolve => { release = resolve; }));
  await prepare(page); await page.getByRole('button', { name: 'Review and confirm' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm operation' }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  release();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByRole('button', { name: 'Sign out' })).toBeEnabled(); expect(f.writes.length).toBe(1);
});
test('revoked access clears account/audit information instead of presenting a stale directory', async ({ page }) => {
  const f = await fixture(page); f.revoke(); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible(); await expect(page.locator('.admin-account')).toHaveCount(0); await expect(page.locator('.admin-nav')).toHaveCount(0);
});
test('revoke inventory is selectable in a modal, validates quantity and works on both layouts', async ({ page }) => {
  const f = await fixture(page);
  await prepare(page, 'revoke-item');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Review and confirm' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Owned item' }).selectOption('shirt-rofinance');
  await page.getByRole('spinbutton', { name: 'Copies to revoke' }).fill('8');
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  expect(f.writes).toHaveLength(0); await expect(dialog).toHaveAttribute('aria-label', 'Manage account');
  await page.getByRole('spinbutton', { name: 'Copies to revoke' }).fill('3');
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  await expect(dialog).toContainText('3 ×'); await dialog.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(dialog).not.toBeVisible(); expect(f.writes[0]).toMatchObject({ path: '/api/admin/operations/revoke-item', body: { itemId: 'shirt-rofinance', copies: 3, targetId: target.id } });
});
test('accounts without a character can receive gifts and points; empty inventory cannot be revoked', async ({ page }) => {
  const f = await fixture(page, false);
  await prepare(page); await expect(page.getByRole('dialog')).toContainText('Enrollment starts on the first character visit');
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await page.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(f.writes[0].body.points).toBe(20);
  await prepare(page, 'grant-item'); await page.getByRole('combobox', { name: 'Item', exact: true }).selectOption('shirt-rofinance');
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await page.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(f.writes[1].body.itemId).toBe('shirt-rofinance');
  await prepare(page, 'revoke-item'); await expect(page.getByRole('dialog')).toContainText('No revocable items');
  await expect(page.getByRole('button', { name: 'Review and confirm' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('revoke-points');
  await expect(page.getByRole('button', { name: 'Review and confirm' })).toBeDisabled();
});
for (const [rejection, heading] of [['unauthorized', 'Sign in required'], ['forbidden-null', 'Access denied']] as const) test(`origin denial remains readable, while ${rejection} clears privileged UI immediately`, async ({ page }) => {
  const f = await fixture(page); f.reject('origin'); await prepare(page);
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await page.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(page.getByRole('dialog')).toContainText('Request origin rejected');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  f.reject(rejection); await page.getByRole('button', { name: 'Confirm operation' }).click();
  await expect(page.locator('.admin-account')).toHaveCount(0); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
});
test('account wardrobe is visible before choosing an action; images select gifts/revocations and previews are shown', async ({ page }, info) => {
  const f = await fixture(page); await prepare(page);
  const wardrobe = page.getByRole('region', { name: 'Account inventory', exact: true });
  await expect(wardrobe.getByRole('img')).toHaveCount(2);
  await expect(wardrobe.getByRole('button', { name: /Basic · cannot revoke/ })).toBeDisabled();
  await wardrobe.getByRole('button', { name: /RoFinance Signature shirt/ }).click();
  await expect(page.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue('revoke-item');
  await expect(page.getByRole('combobox', { name: 'Owned item' })).toHaveValue('shirt-rofinance');
  await page.screenshot({ path: info.outputPath('visual-owned-inventory.png') });
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'RoFinance Signature shirt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('grant-item');
  const gifts = page.getByRole('region', { name: 'Visual item selection', exact: true });
  await expect(gifts.getByRole('img')).toHaveCount(6);
  await gifts.getByRole('button', { name: 'Next items', exact: true }).click();
  await gifts.getByRole('searchbox', { name: 'Search gifts' }).fill('shirt-rofinance');
  await expect(gifts.getByRole('img')).toHaveCount(1);
  await gifts.getByRole('button', { name: /RoFinance Signature shirt/ }).click();
  await expect(page.getByRole('combobox', { name: 'Item', exact: true })).toHaveValue('shirt-rofinance');
  await page.getByRole('button', { name: 'Review and confirm' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'RoFinance Signature shirt', exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm operation' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(f.writes[0].body.itemId).toBe('shirt-rofinance');
});
test('revoke-points displays available balance and validates limits before explicit confirmation', async ({ page }) => {
  const f = await fixture(page); await prepare(page, 'revoke-points');
  await expect(page.locator('.admin-points-summary')).toContainText('140');
  const points = page.getByRole('textbox', { name: 'Points · 1–100,000' });
  await points.fill('141'); await page.getByRole('button', { name: 'Review and confirm' }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Manage account'); expect(f.writes).toHaveLength(0);
  await points.fill('40'); await page.getByRole('button', { name: 'Review and confirm' }).click();
  await expect(page.getByRole('dialog')).toContainText('40 points'); await expect(page.getByRole('dialog')).toContainText('Revoke reward points');
  await page.getByRole('button', { name: 'Confirm operation' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(f.writes[0]).toMatchObject({ path: '/api/admin/operations/revoke-points', body: { points: 40, targetId: target.id } });
});

test('reason and confirmation controls stay in the action column, above the wardrobe on phones', async ({ page }, info) => {
  await fixture(page); await prepare(page, 'revoke-points');
  const reason = page.getByRole('textbox', { name: 'Reason · 5–300 characters' });
  await expect(page.locator('.admin-manage-controls').getByRole('textbox', { name: 'Reason · 5–300 characters' })).toBeVisible();
  const positions = await page.locator('.admin-manage-grid').evaluate(grid => {
    const reason = grid.querySelector<HTMLInputElement>('.admin-manage-controls input[minlength]')!.getBoundingClientRect();
    const wardrobe = grid.querySelector<HTMLElement>('.admin-owned-panel')!.getBoundingClientRect();
    return { reason: { x: reason.x, y: reason.y, right: reason.right, bottom: reason.bottom }, wardrobe: { x: wardrobe.x, y: wardrobe.y } };
  });
  if (info.project.name === 'desktop-dark') expect(positions.reason.right).toBeLessThan(positions.wardrobe.x);
  else expect(positions.reason.bottom).toBeLessThan(positions.wardrobe.y);
  await reason.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('compact-admin-reason.png') });
});

test('gift and revoked points group while typing/pasting/editing and submit only integer values', async ({ page }) => {
  const f = await fixture(page, true, 50000); await prepare(page);
  const points = page.getByRole('textbox', { name: 'Points · 1–100,000' });
  await points.fill(''); await points.pressSequentially('10000'); await expect(points).toHaveValue('10.000');
  await points.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 3)); await points.press('Backspace');
  await expect(points).toHaveValue('1.000');
  await points.fill('10000'); await points.evaluate((input: HTMLInputElement) => input.setSelectionRange(1, 1)); await points.press('2');
  await expect(points).toHaveValue('120.000');
  expect(await points.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(2);
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', 'Manage account');
  await points.fill('1000'); await points.press('.'); await expect(points).toHaveValue('1.000');
  await points.evaluate((input: HTMLInputElement) => { input.select(); const data = new DataTransfer(); data.setData('text', '10,000'); input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(points).toHaveValue('10.000');
  await points.evaluate((input: HTMLInputElement) => { input.select(); const data = new DataTransfer(); data.setData('text', '1.5'); input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(points).toHaveValue('10.000');
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await expect(page.getByRole('dialog')).toContainText('10.000 points');
  await page.getByRole('button', { name: 'Confirm operation' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(f.writes[0]).toMatchObject({ path: '/api/admin/operations/grant-points', body: { points: 10000 } });
  await prepare(page, 'revoke-points'); await points.fill('10000'); await expect(points).toHaveValue('10.000');
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await expect(page.getByRole('dialog')).toContainText('10.000 points');
  await page.getByRole('button', { name: 'Confirm operation' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(f.writes[1]).toMatchObject({ path: '/api/admin/operations/revoke-points', body: { points: 10000 } });
});

test('gift type filters cards and select options together, clears prior selection/search/page, and supports Vietnamese', async ({ page }, info) => {
  const f = await fixture(page); await prepare(page, 'grant-item');
  const slot = page.getByRole('combobox', { name: 'Item type', exact: true });
  const item = page.getByRole('combobox', { name: 'Item', exact: true });
  const gifts = page.getByRole('region', { name: 'Visual item selection', exact: true });
  await item.selectOption('shirt-rofinance'); await gifts.getByRole('button', { name: 'Next items', exact: true }).click();
  await gifts.getByRole('searchbox', { name: 'Search gifts' }).fill('shirt-rofinance');
  for (const type of ITEM_SLOTS) {
    await slot.selectOption(type); await expect(item).toHaveValue('');
    await expect(gifts.getByRole('searchbox', { name: 'Search gifts' })).toHaveValue('');
    const expected = COSMETICS.filter(c => !c.starter && c.slot === type).map(c => c.id);
    expect(await item.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean))).toEqual(expected);
    await expect(gifts.getByRole('img')).toHaveCount(Math.min(6, expected.length));
    expect(await gifts.locator('.admin-visual-item').evaluateAll(cards => cards.map(card => card.getAttribute('title')))).toEqual(expected.slice(0, 6));
    await expect(gifts.getByRole('button', { name: 'Previous items', exact: true })).toBeDisabled();
  }
  await slot.selectOption('hat'); await gifts.getByRole('searchbox', { name: 'Search gifts' }).fill('hat-rofinance');
  await gifts.getByRole('button', { name: /RoFinance Signature hat/ }).click(); await expect(item).toHaveValue('hat-rofinance');
  await page.screenshot({ path: info.outputPath('gift-type-filter.png') });
  await page.getByRole('button', { name: 'Review and confirm' }).click(); await page.getByRole('button', { name: 'Confirm operation' }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(f.writes[0].body.itemId).toBe('hat-rofinance');
  await page.getByRole('button', { name: 'Switch to Vietnamese' }).click();
  await page.locator('.admin-account').filter({ hasText: target.email }).getByRole('button', { name: 'Quản lý', exact: true }).click();
  await page.getByRole('combobox', { name: 'Thao tác', exact: true }).selectOption('grant-item');
  await page.getByRole('combobox', { name: 'Loại vật phẩm', exact: true }).selectOption({ label: 'Mũ' });
  await expect(page.getByRole('combobox', { name: 'Vật phẩm', exact: true }).locator('option[value="shirt-rofinance"]')).toHaveCount(0);
});
