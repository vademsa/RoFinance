import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';
import { prepareCommunityFinance } from '../../server/communityStore';
import { validateCommunityDesign, type CommunityPlan } from '../../shared/communityPlans';
import type { LocalAppData } from '../../src/lib/localDb';

test('community designer publishes design only, adopts safely and keeps history across reload', async ({ page }, info) => {
  const language = info.project.name === 'phone-light' ? 'vi' : 'en';
  const fixture = await characterFixture(page, { language, light: language === 'vi' });
  let plans: CommunityPlan[] = [], published: unknown;
  await page.route('**/api/community-plans**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    expect(r.headers()['x-rofinance-owner']).toBe('11111111-1111-4111-8111-111111111111');
    if (r.method() === 'GET') return json({ page: 1, plans, total: plans.length });
    if (path.endsWith('/adopt')) {
      const body = r.postDataJSON(); expect(body.expectedRevision).toBe(fixture.revision());
      const next = prepareCommunityFinance(fixture.finance(), { id: plans[0].id, design: plans[0] });
      const revision = fixture.replaceFinanceFromServer(next as LocalAppData);
      return json({ revision, creatorRewardGranted: false });
    }
    if (r.method() === 'POST') {
      published = r.postDataJSON(); const design = validateCommunityDesign(published);
      plans = [{ ...design, id: '44444444-4444-4444-8444-444444444444', active: true, isOwner: true, adoptionCount: 0 }];
      return json({ plan: plans[0] });
    }
    plans = []; return json({ success: true });
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', { name: /^(Choose an allocation plan|Chọn kiểu phân bổ)$/ }).click();
  await page.getByRole('button', { name: /^(Community jar templates|Mẫu hũ cộng đồng) ·/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(Design template|Thiết kế mẫu)$/ }).click();
  await dialog.getByLabel(/^(Template name|Tên mẫu)$/).fill('Public test design');
  await dialog.getByLabel(/^(Public alias|Bí danh công khai)$/).fill('Pixel creator');
  await dialog.getByRole('button', { name: /^(Add jar|Thêm hũ)$/ }).click();
  await expect(dialog.getByRole('button', { name: /^(Remove jar|Xóa hũ) / })).toHaveCount(8);
  await dialog.getByRole('button', { name: /^(Remove jar|Xóa hũ) 8$/ }).click();
  await dialog.getByLabel(/^(Jar name|Tên hũ)$/).first().fill('Custom essentials');
  await dialog.screenshot({ path: info.outputPath('community-designer.png') });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: /^(Publish publicly|Đăng công khai)$/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Public test design' })).toBeVisible();
  const serialized = JSON.stringify(published);
  for (const key of ['accountNumber', 'bankCode', 'targetBudget', 'currentSpent', 'monthlyIncome', 'transactions']) expect(serialized).not.toContain(key);
  const before = structuredClone(fixture.finance());
  await dialog.getByRole('button', { name: /^(Use template|Sử dụng mẫu)$/ }).click();
  await dialog.getByRole('button', { name: /^(Confirm adoption|Xác nhận áp dụng)$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixture.finance().activeJarPlanId).toBe('snapshot-community-44444444-4444-4444-8444-444444444444');
  expect(fixture.finance().transactions).toEqual(before.transactions);
  expect(fixture.finance().jarPlanSnapshots.some(s => s.jars[0].name === before.jars[0].name)).toBe(true);
  await expect(page.getByText('Custom essentials', { exact: true }).first()).toBeVisible();
  await page.reload(); await expect(page.getByText('Custom essentials', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const failure of ['lost response', 'failed hydration']) test(`${failure} cannot overwrite saved template and recovers by reload`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language: 'en' });
  const plan: CommunityPlan = { title: 'Recovery plan', description: '', publicAlias: 'Creator', id: '55555555-5555-4555-8555-555555555555', active: true, isOwner: false, adoptionCount: 0, jars: [{ code: 'NEC', name: 'Recovered essentials', percentage: 100, color: '#6366f1', description: '' }] };
  let attempted = false, rewardCount = 0;
  let failGet = false;
  await page.route('**/api/data', async route => {
    if (route.request().method() === 'GET' && failGet) { failGet = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'OFFLINE' }) }); }
    return route.fallback();
  });
  await page.route('**/api/community-plans**', async route => {
    const r = route.request();
    if (r.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ page: 1, total: 1, plans: [plan] }) });
    attempted = true; rewardCount++;
    const revision = fixture.replaceFinanceFromServer(prepareCommunityFinance(fixture.finance(), { id: plan.id, design: plan }) as LocalAppData);
    if (failure === 'failed hydration') { failGet = true; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ revision, creatorRewardGranted: true }) }); }
    // Server committed, but client never received its response.
    return route.abort('failed');
  });
  await page.goto('/'); await page.getByRole('button', { name: /^(Choose an allocation plan|Chọn kiểu phân bổ)$/ }).click();
  await page.getByRole('button', { name: /^Community jar templates ·/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Use template', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm adoption', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible(); expect(attempted).toBe(true);
  const writes = fixture.writes();
  await page.waitForTimeout(800); expect(fixture.writes()).toBe(writes);
  expect(fixture.finance().activeJarPlanId).toBe(`snapshot-community-${plan.id}`);
  await dialog.getByRole('button', { name: 'Reload data', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Recovered essentials', { exact: true }).first()).toBeVisible();
  expect(rewardCount).toBe(1);
});
