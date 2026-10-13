import { test, expect } from '@playwright/test';
import { characterFixture } from './fixture';

for (const language of ['en', 'vi'] as const) test(`demo ranking is explicit, separate and read-only in ${language}`, async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light', language });
  await page.route('**/api/character/leaderboard?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ season: new URL(route.request().url()).searchParams.get('season'), entries: [] }) });
  });
  const mutations: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/character/') && request.method() !== 'GET') mutations.push(request.method()); });
  await page.goto('/');
  await page.getByRole('button', { name: language === 'en' ? 'Analytics' : 'Thống Kê', exact: true }).click();
  const ranking = page.locator('.character-leaderboard');
  await page.getByRole('button', { name: language === 'en' ? 'View character leaderboard' : 'Xem bảng xếp hạng nhân vật', exact: true }).click();
  await expect(ranking.getByRole('heading')).toBeInViewport();
  await expect(ranking.getByRole('heading')).toBeFocused();
  await expect(ranking.getByText(language === 'en' ? 'No opted-in characters' : 'Chưa có nhân vật tham gia', { exact: false })).toBeVisible();
  await page.waitForTimeout(1200);
  const state = structuredClone(fixture.state()), finance = structuredClone(fixture.finance()), writes = fixture.writes();
  await expect(ranking.locator('.character-ranking-row')).toHaveCount(0);
  await ranking.getByRole('button', { name: language === 'en' ? 'View demo leaderboard' : 'Xem bảng xếp hạng mẫu' }).click();
  await expect(ranking.getByText(language === 'en' ? 'Demo data · Not real users.' : 'Dữ liệu mô phỏng · Không phải người dùng thật.', { exact: false })).toBeVisible();
  await expect(ranking.locator('.character-ranking-row')).toHaveCount(5);
  await expect(ranking.getByRole('combobox')).toBeDisabled();
  await expect(ranking.getByLabel(language === 'en' ? 'Rank 2' : 'Hạng 2', { exact: true })).toHaveCount(2);
  expect(await ranking.innerText()).not.toMatch(/₫|\$|Private account|Synthetic lunch|fixture@example/);
  expect(await ranking.locator('[data-mood]').evaluateAll((nodes) => nodes.every((node) => node.getAttribute('data-mood') === 'steady'))).toBe(true);
  await ranking.screenshot({ path: info.outputPath(`demo-${language}.png`) });
  await ranking.getByRole('button', { name: language === 'en' ? 'Back to real leaderboard' : 'Về bảng xếp hạng thật' }).click();
  await expect(ranking.locator('.character-ranking-row')).toHaveCount(0);
  await expect(ranking.getByRole('combobox')).toBeEnabled();
  expect(mutations).toEqual([]); expect(fixture.state()).toEqual(state);
  expect(fixture.finance()).toEqual(finance); expect(fixture.writes()).toBe(writes);
});

async function openLeaderboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Character leaderboard' })).toBeVisible();
  return page.locator('.character-leaderboard');
}

test('Statistics renders only safe public scores, neutral avatars and equal ranks; season changes and profile entry work', async ({ page }, info) => {
  const fixture = await characterFixture(page, { light: info.project.name === 'phone-light' });
  const leaderboard = await openLeaderboard(page);
  await expect(leaderboard.getByText('Pixel Leaf', { exact: true })).toBeVisible();
  await expect(leaderboard.getByLabel('Rank 1', { exact: true })).toHaveCount(2);
  await expect(leaderboard.getByLabel('Rank 3', { exact: true })).toHaveCount(1);
  const text = await leaderboard.innerText();
  expect(text).not.toMatch(/₫|\$|10,000,000|100,000|fixture@example|Private account|Synthetic lunch/);
  expect(await leaderboard.locator('[data-slot=expression]').evaluateAll((items) => items.every((item) => item.getAttribute('data-mood') === 'steady'))).toBe(true);
  await expect(leaderboard.getByText('Your character is private.', { exact: false })).toBeVisible();
  const season = leaderboard.getByRole('combobox', { name: 'Ranking season' });
  const options = await season.locator('option').evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  const response = page.waitForResponse((result) => result.url().includes(`/api/character/leaderboard?season=${options[1]}`));
  await season.selectOption(options[1]); await response;
  await expect(leaderboard.getByText('Pixel Leaf', { exact: true })).toBeVisible();
  expect(await leaderboard.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await leaderboard.screenshot({ path: test.info().outputPath('leaderboard.png') });
  await leaderboard.getByRole('button', { name: 'Character profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Character profile', exact: true })).toBeVisible();
  expect(fixture.state().optIn).toBe(false);
});

test('empty season and failed/malformed ranking recover without disrupting financial charts', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light' });
  let mode: 'error' | 'malformed' | 'empty' = 'error';
  await page.route('**/api/character/leaderboard?*', async (route) => {
    const season = new URL(route.request().url()).searchParams.get('season');
    const body = mode === 'error' ? { error: 'CHARACTER_UNAVAILABLE' } : mode === 'malformed'
      ? { season, entries: [{ rank: 1, nickname: 'Must not render', income: 9999999 }] } : { season, entries: [] };
    await route.fulfill({ status: mode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const leaderboard = await openLeaderboard(page);
  await expect(leaderboard.getByRole('alert')).toBeVisible();
  mode = 'malformed';
  const malformedResponse = page.waitForResponse((response) => response.url().includes('/api/character/leaderboard?'));
  await leaderboard.getByRole('button', { name: 'Try again' }).click(); await malformedResponse;
  await expect(leaderboard.getByRole('alert')).toBeVisible();
  await expect(leaderboard.getByText('Must not render', { exact: true })).toHaveCount(0);
  mode = 'empty';
  const emptyResponse = page.waitForResponse((response) => response.url().includes('/api/character/leaderboard?'));
  await leaderboard.getByRole('button', { name: 'Try again' }).click(); await emptyResponse;
  await expect(leaderboard.getByText('No opted-in characters', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export selected cycle to Excel', exact: true })).toBeVisible();
});

test('Vietnamese leaderboard does not expose private profile names or money', async ({ page }, info) => {
  await characterFixture(page, { light: info.project.name === 'phone-light', language: 'vi' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Thống Kê', exact: true }).click();
  const leaderboard = page.locator('.character-leaderboard');
  await expect(leaderboard.getByRole('heading', { name: 'Bảng xếp hạng nhân vật', exact: true })).toBeVisible();
  await expect(leaderboard.getByRole('combobox', { name: 'Mùa xếp hạng' })).toBeVisible();
  await expect(leaderboard.getByText('Pixel Leaf', { exact: true })).toBeVisible();
  expect(await leaderboard.innerText()).not.toMatch(/₫|\$|Private account|Synthetic lunch/);
});
