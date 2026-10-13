import { expect, test } from '@playwright/test';
import { getDrawPool } from '../../shared/character';
import { OUTFIT_SETS } from '../../src/utils/outfitSets';
import { characterFixture, startDraw } from './fixture';

test('Signature collection has metallic R art, owned full-set preview/save and a compact bilingual catalogue', async ({ page }, info) => {
  const language = info.project.name === 'phone-light' ? 'vi' : 'en';
  const vi = language === 'vi';
  const set = OUTFIT_SETS.find(entry => entry.id === 'rofinance')!;
  const fixture = await characterFixture(page, { light: vi, language, ownedItemIds: Object.values(set.items) as string[] });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: vi ? 'Hồ sơ nhân vật' : 'Character profile', exact: true }).click();
  await expect.poll(() => fixture.finance().transactions[0].bankName).toBe('Tiền mặt');
  await page.waitForTimeout(1200);
  const before = structuredClone({ finance: fixture.finance(), points: fixture.state().spentPoints, owned: fixture.state().ownedItemIds });
  await page.locator('.character-set-details summary').click();
  await page.getByRole('button', { name: `${vi ? 'Mặc thử bộ' : 'Preview set'} ${vi ? set.vi : set.en}`, exact: true }).click();
  const stage = page.locator('.character-stage');
  await expect(stage.locator('.full-set-effect')).toHaveAttribute('data-outfit-set', 'rofinance');
  await expect(stage.locator('.pixel-character [data-signature-logo="R"]')).toHaveCount(7);
  await expect(stage.locator('.signature-glints').first()).not.toHaveCSS('animation-name', 'none');
  await stage.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await stage.screenshot({ path: info.outputPath('signature-set.png') });
  expect(fixture.state().equipped.shirt).toBe('shirt-basic');
  await page.getByRole('button', { name: vi ? 'Lưu trang phục' : 'Save outfit', exact: true }).click();
  await expect.poll(() => fixture.state().equipped).toEqual(set.items);
  await page.locator('.character-tabs').getByRole('button', { name: vi ? 'Quay thưởng' : 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: vi ? 'Xem phần thưởng' : 'View rewards', exact: true }).click();
  const catalogue = page.getByRole('dialog');
  await catalogue.getByRole('button', { name: vi ? 'Huyền thoại' : 'Legendary', exact: true }).click();
  await catalogue.getByLabel(vi ? 'Lọc loại vật phẩm' : 'Filter item category').selectOption('shirt');
  const card = catalogue.locator('[data-item-id="shirt-rofinance"]');
  await expect(card).toHaveAttribute('data-exclusive', 'true');
  await expect(card).toContainText(vi ? 'Độc quyền RoFinance' : 'RoFinance exclusive');
  await expect(card.locator('[data-signature-logo="R"]')).toHaveCount(2);
  await expect(card).toHaveCSS('animation-name', 'signature-border-shine');
  await catalogue.screenshot({ path: info.outputPath('signature-catalogue.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(card).toHaveCSS('animation-name', 'none');
  await expect(card.locator('.signature-glints')).toHaveCSS('animation-name', 'none');
  expect(fixture.finance()).toEqual(before.finance);
  expect(fixture.state().spentPoints).toBe(before.points);
  expect(fixture.state().ownedItemIds).toEqual(before.owned);
  expect(fixture.drawRequests).toHaveLength(0);
});

test('a fully suspended app resumes directly at the exact confirmed Signature prize after ten real seconds', async ({ page }, info) => {
  const index = getDrawPool('legendary').findIndex(item => item.id === 'shirt-rofinance');
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 1999965, drawItemIndex: index });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: /Draw an item/ }).click();
  const dialog = page.getByRole('dialog');
  expect(fixture.drawRequests).toHaveLength(0);
  await dialog.getByRole('button', { name: /^Start draw/ }).click();
  await expect.poll(() => fixture.drawRequests.length).toBe(1);
  await expect(dialog.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise(resolve => setTimeout(resolve, 10500));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(dialog.locator('.reward-result')).toContainText('RoFinance Signature shirt', { timeout: 2000 });
    await expect(dialog.locator('.reward-reel-card[data-active="true"]')).toHaveAttribute('data-item-id', 'shirt-rofinance');
    await expect(dialog.locator('.reward-result')).toHaveAttribute('data-exclusive', 'true');
    await expect(dialog.getByRole('button', { name: /^Draw again/ })).toBeEnabled();
    expect(fixture.drawRequests).toHaveLength(1);
    expect(fixture.state().spentPoints).toBe(20);
    await page.screenshot({ path: info.outputPath('signature-resume-result.png') });
  } finally { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach(); }
});

test('resume past the deadline never invents an outcome while confirmation is pending, then lands immediately on the exact response', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', drawRoll: 0 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/character/draw', async route => { await gate; await route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Character profile', exact: true }).click();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await startDraw(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.reward-reel-track')).toHaveAttribute('data-settling', 'true');
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise(resolve => setTimeout(resolve, 10500));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(dialog.locator('.reward-result')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Spinning…', exact: true })).toBeDisabled();
    release();
    await expect(dialog.locator('.reward-result')).toContainText('No item won', { timeout: 2000 });
    await expect(dialog.locator('.reward-reel-card[data-active="true"]')).toHaveAttribute('data-item-id', 'none');
    expect(fixture.drawRequests).toHaveLength(1);
    expect(fixture.state().spentPoints).toBe(20);
  } finally { release(); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach(); }
});
