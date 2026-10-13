import type { Page } from '@playwright/test';
import { DEFAULT_JARS } from '../../src/constants/defaultData';
import { DEFAULT_APP_PREFERENCES } from '../../src/lib/preferences';
import type { LocalAppData } from '../../src/lib/localDb';
import { salaryCycle, vietnamDate, type DrawResult, type MaterialResult } from '../../shared/character';
import { CharacterError, hasNewDailyExpense, newCharacter, privateProfile, updateCharacter, drawCharacter, exchangeCharacter, transformDuplicates } from '../../server/characterStore';

export async function startDraw(page: Page, language: 'vi' | 'en' = 'en') {
  await page.getByRole('button', { name: language === 'en' ? /Draw an item/ : /Quay thưởng ·/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: language === 'en' ? /^Start draw/ : /^Bắt đầu quay/ }).click();
}

// All requests are intercepted: these synthetic finances never reach a real backend.
export async function characterFixture(page: Page, options: { light?: boolean; fragments?: number; spentPoints?: number; bonusPoints?: number; ownedItemIds?: string[]; duplicateItemCounts?: Record<string, number>; failMaterialAfterCommit?: boolean; failDrawAfterCommit?: boolean; failDrawAfterCommitAt?: number; failExchangeAfterCommit?: boolean; malformedDrawAfterCommit?: boolean; offline?: boolean; language?: 'vi' | 'en'; drawRoll?: number; drawItemIndex?: number; pityCount?: number; drawDelayMs?: number } = {}) {
  const today = vietnamDate();
  const cycle = salaryCycle(today, 25);
  let finance: LocalAppData = {
    monthlyIncome: 10000000,
    jars: DEFAULT_JARS.map((jar) => ({ ...jar, targetBudget: 10000000 * jar.percentage / 100,
      cycleAllocation: 10000000 * jar.percentage / 100, carryovers: [], transferredIn: [], currentSpent: jar.code === 'NEC' ? 100000 : 0 })),
    transactions: [{ id: 'fixture-expense', type: 'expense', jarId: 'jar-nec', amount: 100000,
      date: today, description: 'Synthetic lunch', category: 'Ăn uống', paymentMethodCode: 'CASH' }],
    archivedJars: [], activeJarPlanId: 'custom', jarPlanSnapshots: [], customCategories: [], bankAccounts: [],
    cryptoAssets: [], safetyInvestments: [], debtItems: [], isAmountsHidden: false,
    preferences: { ...DEFAULT_APP_PREFERENCES, theme: options.light ? 'light' : 'dark', language: options.language || 'en', monthlyResetDay: 25 },
    activeCycleStart: cycle.start, monthlySummaries: [], updatedAt: new Date().toISOString(),
  };
  let state = newCharacter(finance, today);
  state.fragments = options.fragments || 0;
  state.spentPoints = options.spentPoints ?? 0;
  state.pityCount = options.pityCount || 0;
  if (options.bonusPoints !== undefined) state.bonusPoints = options.bonusPoints;
  if (options.ownedItemIds) state.ownedItemIds = [...new Set([...state.ownedItemIds, ...options.ownedItemIds])];
  if (options.duplicateItemCounts) state.duplicateItemCounts = { ...options.duplicateItemCounts };
  let revision = 1;
  let apiRevision = 'a'.repeat(64);
  let financeWrites = 0;
  let dailyRewardClaimed = false;
  let failedDraw = false;
  let profileDelayMs = 0;
  const drawRequests: string[] = [];
  const draws = new Map<string, DrawResult>();
  const exchanges = new Map<string, { itemId: string }>();
  const exchangeRequests: string[] = [];
  const materialRequests: string[] = [];
  const transformations = new Map<string, MaterialResult>();
  let failedMaterial = false;
  await page.context().route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const profile = () => privateProfile(state, finance, today);
    if (url.pathname === '/api/app-version') {
      // Built pages have a release marker; match it so synthetic API responses
      // do not trigger the real application's stale-bundle reload protection.
      const webRevision = await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="rofinance-release"]')?.content ?? null).catch(() => null);
      return json({ apiRevision, webRevision });
    }
    if (url.pathname === '/api/auth/me') return json({ user: { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.com', displayName: 'Private account', avatarUrl: null } });
    if (url.pathname === '/api/auth/providers') return json({ google: false, apple: false });
    if (url.pathname === '/api/data') {
      if (method === 'GET') return json({ data: finance, revision: String(revision) });
      if (request.headers()['if-match'] !== `"${revision}"`) return json({ error: 'STALE_FINANCE' }, 409);
      const next = { ...finance, ...request.postDataJSON() };
      const dailyRewardGranted = !dailyRewardClaimed && hasNewDailyExpense(next, finance, today);
      if (dailyRewardGranted) { dailyRewardClaimed = true; state.bonusPoints = (state.bonusPoints || 0) + 20; }
      finance = next; financeWrites++; revision++;
      return json({ success: true, revision: String(revision), dailyRewardGranted });
    }
    if (options.offline && url.pathname.startsWith('/api/character')) return json({ error: 'CHARACTER_UNAVAILABLE' }, 503);
    if (url.pathname === '/api/character/profile') {
      if (method === 'PATCH') state = updateCharacter(state, request.postDataJSON());
      const snapshot = profile();
      if (method === 'GET' && profileDelayMs) await new Promise((resolve) => setTimeout(resolve, profileDelayMs));
      return json({ profile: snapshot });
    }
    if (url.pathname === '/api/character/draw') {
      const { requestId } = request.postDataJSON();
      drawRequests.push(requestId);
      if (options.drawDelayMs) await new Promise((resolve) => setTimeout(resolve, options.drawDelayMs));
      if (!draws.has(requestId)) {
        let response;
        try { response = drawCharacter(state, options.drawRoll ?? 1895000, options.drawItemIndex ?? 0); }
        catch (error) { if (error instanceof CharacterError) return json({ error: error.code }, error.status); throw error; }
        state = response.state; draws.set(requestId, response.result);
        if ((options.failDrawAfterCommit || options.malformedDrawAfterCommit || options.failDrawAfterCommitAt === state.drawCount) && !failedDraw) {
          failedDraw = true;
          return options.malformedDrawAfterCommit ? json({ profile: {}, result: {} }) : json({ error: 'CHARACTER_UNAVAILABLE' }, 500);
        }
      }
      return json({ profile: profile(), result: draws.get(requestId) });
    }
    if (url.pathname === '/api/character/exchange') {
      const { requestId, itemId } = request.postDataJSON(); exchangeRequests.push(requestId);
      if (!exchanges.has(requestId)) {
        state = exchangeCharacter(state, itemId); exchanges.set(requestId, { itemId });
        if (options.failExchangeAfterCommit) return json({ error: 'CHARACTER_UNAVAILABLE' }, 500);
      }
      return json({ profile: profile(), result: exchanges.get(requestId) });
    }
    if (url.pathname === '/api/character/recycle' || url.pathname === '/api/character/fuse') {
      const { requestId, items } = request.postDataJSON(); materialRequests.push(requestId);
      const kind = url.pathname.endsWith('/recycle') ? 'recycle' : 'fuse';
      if (!transformations.has(requestId)) {
        try {
          const response = transformDuplicates(state, kind, items, 0);
          state = response.state; transformations.set(requestId, response.result);
        } catch (error) { if (error instanceof CharacterError) return json({ error: error.code }, error.status); throw error; }
        if (options.failMaterialAfterCommit && !failedMaterial) { failedMaterial = true; return json({ error: 'CHARACTER_UNAVAILABLE' }, 500); }
      }
      return json({ profile: profile(), result: transformations.get(requestId) });
    }
    if (url.pathname === '/api/character/leaderboard') return json({ season: url.searchParams.get('season'), entries: [
      { rank: 1, nickname: 'Pixel Leaf', characterId: 'leaf', equipped: state.equipped, score: 93 },
      { rank: 1, nickname: 'Pixel River', characterId: 'river', equipped: state.equipped, score: 93 },
      { rank: 3, nickname: 'Pixel Cloud', characterId: 'cloud', equipped: state.equipped, score: 86 },
    ] });
    return json({ error: 'NOT_FOUND' }, 404);
  });
  return { state: () => state, finance: () => finance, writes: () => financeWrites, drawRequests, exchangeRequests, materialRequests,
    revision: () => String(revision),
    replaceFinanceFromServer: (data: LocalAppData) => { finance = data; revision += 1; return String(revision); },
    updateRelease: () => { apiRevision = 'b'.repeat(64); },
    spendPointsElsewhere: () => { state = drawCharacter(state, options.drawRoll ?? 1895000, options.drawItemIndex ?? 0).state; },
    delayProfiles: (ms: number) => { profileDelayMs = ms; } };
}
