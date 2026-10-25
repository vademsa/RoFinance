import assert from 'node:assert/strict';
import test from 'node:test';
import type { MonthlyCycleSummary } from '../../src/types';
import { assessBudgets, assessFinance, eligibleAwards, validateEquipment, DEFAULT_EQUIPMENT,
  COSMETICS, DRAW_TICKETS, NO_PRIZE_TICKETS, RARITY_TICKETS, RARITIES, getDrawPool, getDrawRarity, getItemDrawOdds, getRarityOdds, getNoPrizeOdds, visibleCosmetics,
  selectDrawItem, pointsForState, salaryCycle, vietnamDate, type CharacterState } from '../../shared/character';

const summary = (start = '2026-09-25', end = '2026-10-24', scale = 1): MonthlyCycleSummary => ({
  id: start, cycleStart: start, cycleEnd: end, income: 1000 * scale, expense: 600 * scale,
  transactionCount: 1, spendingByJar: [{ jarId: 'nec', amount: 600 * scale }], createdAt: `${end}T12:00:00Z`,
  jarBreakdown: [{ jarId: 'nec', jarCode: 'NEC', jarName: 'Private name', openingCarryover: 0,
    cycleAllocation: 1000 * scale, availableBudget: 1000 * scale, spent: 600 * scale,
    remaining: 400 * scale, closingCarryovers: [] }],
});
test('management score is scale invariant and does not reward empty or unfunded cycles', () => {
  const first = eligibleAwards({ monthlySummaries: [summary()] }, '2026-09-25', '2026-10-25');
  const larger = eligibleAwards({ monthlySummaries: [summary(undefined, undefined, 10000)] }, '2026-09-25', '2026-10-25');
  assert.equal(first['2026-10'].score, larger['2026-10'].score);
  assert.equal(first['2026-10'].points, 20);
  assert.deepEqual(eligibleAwards({ monthlySummaries: [{ ...summary(), income: 0 }] }, '2026-09-25', '2026-10-25'), {});
  assert.deepEqual(eligibleAwards({ monthlySummaries: [{ ...summary(), spendingByJar: [], expense: 0 }] }, '2026-09-25', '2026-10-25'), {});
});
test('rewards wait for cycle completion, exclude old records and count overlapping periods once', () => {
  assert.deepEqual(eligibleAwards({ monthlySummaries: [summary()] }, '2026-09-25', '2026-10-24'), {});
  assert.deepEqual(eligibleAwards({ monthlySummaries: [summary()] }, '2026-10-25', '2026-11-25'), {});
  const awards = eligibleAwards({ monthlySummaries: [summary(), summary('2026-10-01', '2026-10-31'), summary('2026-10-20', '2026-11-19')] }, '2026-09-25', '2026-11-25');
  assert.equal(Object.keys(awards).length, 1);
});
test('backdate corrections replace an earned reward and create a recoverable shortfall', () => {
  const awards = eligibleAwards({ monthlySummaries: [summary()] }, '2026-09-25', '2026-10-25');
  const state: CharacterState = { version: 1, characterId: 'sun', nickname: 'Public', optIn: false,
    equipped: DEFAULT_EQUIPMENT, ownedItemIds: COSMETICS.filter((item) => item.starter).map((item) => item.id),
    fragments: 0, spentPoints: 60, drawCount: 3, pityCount: 0, enrolledCycleStart: '2026-09-25',
    enrolledAt: '2026-09-25T12:00:00Z', awards };
  assert.equal(pointsForState(state).availablePoints, 0);
  const corrected = eligibleAwards({ monthlySummaries: [{ ...summary(), income: 0 }] }, state.enrolledCycleStart, '2026-10-25');
  assert.equal(pointsForState({ ...state, awards: corrected }).pointsShortfall, 20);
  assert.equal(pointsForState({ ...state, awards: corrected }).availablePoints, 0);
});
test('transfers do not change mood and incomplete data remains neutral', () => {
  const data = { monthlyIncome: 1000, activeCycleStart: '2026-09-25', jars: [{ id: 'nec', code: 'NEC', targetBudget: 1000 } as any],
    preferences: { monthlyResetDay: 25 }, transactions: [] };
  const before = assessFinance(data, '2026-10-05');
  const after = assessFinance({ ...data, transactions: [{ id: 'transfer', type: 'transfer', amount: 999,
    date: '2026-10-01', jarId: 'nec', transferToJarId: 'play' } as any] }, '2026-10-05');
  assert.deepEqual(before, after);
  assert.equal(before.score, null);
  assert.equal(assessFinance({}, '2026-10-05').mood, 'steady');
});
test('archived spending counts but archived funds do not provide a remaining buffer', () => {
  const result = assessBudgets([{ available: 1000, spent: 1200, code: 'OLD', archived: true },
    { available: 1000, spent: 1000, code: 'NEC' }], 2000, '2026-09-25', '2026-10-24', '2026-10-25', 2);
  assert.equal(result.mood, 'attention');
  assert.ok(result.score! < 85);
});
test('draw selection uses fixed published thresholds, even with a legacy insurance count', () => {
  assert.equal(selectDrawItem(0, 0, 0).item, null);
  assert.equal(selectDrawItem(1299999, 0, 0).item, null);
  assert.equal(selectDrawItem(1300000, 0, 0).item?.rarity, 'common');
  assert.equal(selectDrawItem(1894999, 0, 0).item?.rarity, 'common');
  assert.equal(selectDrawItem(1895000, 0, 0).item?.rarity, 'rare');
  assert.equal(selectDrawItem(1996499, 0, 0).item?.rarity, 'rare');
  assert.equal(selectDrawItem(1996500, 0, 0).item?.rarity, 'special');
  assert.equal(selectDrawItem(1999965, 0, 0).item?.rarity, 'legendary');
  assert.equal(selectDrawItem(1999964, 0, 0).item?.rarity, 'special');
  assert.equal(selectDrawItem(1999999, 0, 0).item?.rarity, 'legendary');
  assert.deepEqual(selectDrawItem(0, 0, 9), { item: null, guaranteed: false, pityCount: 0 });
  assert.equal(selectDrawItem(1300000, 6, 999).item?.rarity, 'common');
  assert.equal(selectDrawItem(1300000, 6, 999).guaranteed, false);
  assert.throws(() => selectDrawItem(DRAW_TICKETS, 0, 0));
});
test('published catalogue odds exactly match fixed server distribution regardless of old insurance counters', () => {
  for (const pity of [0, 8, 9, 999]) {
    const counts = { none: 0, common: 0, rare: 0, special: 0, legendary: 0 };
    for (let roll = 0; roll < DRAW_TICKETS; roll++) counts[getDrawRarity(roll, pity)]++;
    for (const rarity of RARITIES) assert.equal(counts[rarity], getRarityOdds(pity)[rarity] * DRAW_TICKETS / 100);
    assert.equal(counts.none, getNoPrizeOdds(pity) * DRAW_TICKETS / 100);
    const odds = COSMETICS.reduce((total, item) => total + getItemDrawOdds(item, pity), 0);
    assert.ok(Math.abs(odds + getNoPrizeOdds(pity) - 100) < 1e-10);
    assert.ok(Math.abs(COSMETICS.filter((item) => item.secret).reduce((total, item) => total + getItemDrawOdds(item, pity), 0) - 0.00175 / 4) < 1e-10);
    for (const item of COSMETICS.filter((item) => item.secret)) assert.equal(getItemDrawOdds(item, pity), 0.00175 / 28);
    assert.equal(getRarityOdds(pity).legendary, 0.00175);
    for (const item of COSMETICS.filter((item) => item.starter)) assert.equal(getItemDrawOdds(item, pity), 0);
  }
  assert.equal(COSMETICS.length, 126);
  assert.equal(new Set(COSMETICS.map((item) => item.id)).size, 126);
  assert.equal(getDrawPool('common').length, 49);
  assert.equal(getDrawPool('rare').length, 28);
  assert.equal(getDrawPool('special').length, 14);
  assert.equal(getDrawPool('legendary').length, 28);
  assert.deepEqual(getRarityOdds(999), { common: 29.75, rare: 5.075, special: 0.17325, legendary: 0.00175 });
  assert.equal(getNoPrizeOdds(999), 65);
});
test('item chance increases by fifteen percentage points with exact unchanged conditional rarity ratios', () => {
  assert.equal(DRAW_TICKETS - NO_PRIZE_TICKETS, 700_000);
  assert.equal(NO_PRIZE_TICKETS + Object.values(RARITY_TICKETS).reduce((sum, count) => sum + count, 0), DRAW_TICKETS);
  const previous = { common: 170_000, rare: 29_000, special: 990, legendary: 10 };
  for (const rarity of RARITIES) assert.equal(RARITY_TICKETS[rarity] * 200_000, previous[rarity] * 700_000);
  assert.equal((DRAW_TICKETS - NO_PRIZE_TICKETS) / DRAW_TICKETS * 100, 35);
});
test('all secret prizes are reachable and draw indices are bounded by the actual rarity pool', () => {
  assert.deepEqual([0, 1, 2].map((index) => selectDrawItem(1999965, index, 0).item?.id), ['hat-comet', 'shirt-aurora', 'backpack-orbit']);
  for (const item of COSMETICS.filter((item) => item.secret)) {
    assert.equal(selectDrawItem(1999965, getDrawPool('legendary').findIndex((entry) => entry.id === item.id), 9).item?.id, item.id);
  }
  assert.throws(() => selectDrawItem(1999965, 28, 0));
  assert.throws(() => selectDrawItem(0, 35, 0));
  assert.throws(() => selectDrawItem(1300000, -1, 0));
  assert.throws(() => selectDrawItem(1300000, 0.5, 0));
});
test('undiscovered secrets stay outside wardrobe while original inventory IDs remain valid', () => {
  const starters = COSMETICS.filter((item) => item.starter).map((item) => item.id);
  assert.equal(visibleCosmetics(starters).length, 119);
  assert.ok(visibleCosmetics(starters).every((item) => !item.secret));
  assert.deepEqual(visibleCosmetics([...starters, 'hat-comet']).filter((item) => item.secret).map((item) => item.id), ['hat-comet']);
  const oldOwned = COSMETICS.filter((item) => !item.secret).map((item) => item.id);
  assert.deepEqual(validateEquipment(DEFAULT_EQUIPMENT, oldOwned), DEFAULT_EQUIPMENT);
  assert.equal(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'hat-comet' }, oldOwned), null);
  assert.ok(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'hat-comet' }, [...oldOwned, 'hat-comet']));
});
test('equipment cannot use unowned items, another slot or unknown properties', () => {
  const owned = COSMETICS.filter((item) => item.starter).map((item) => item.id);
  assert.deepEqual(validateEquipment(DEFAULT_EQUIPMENT, owned), DEFAULT_EQUIPMENT);
  assert.equal(validateEquipment({ ...DEFAULT_EQUIPMENT, shirt: 'shirt-gold' }, owned), null);
  assert.equal(validateEquipment({ ...DEFAULT_EQUIPMENT, hat: 'shirt-basic' }, owned), null);
  assert.equal(validateEquipment({ ...DEFAULT_EQUIPMENT, points: 999 }, owned), null);
});
test('salary dates are calendar based, including short months and Vietnamese midnight', () => {
  assert.deepEqual(salaryCycle('2026-03-01', 31), { start: '2026-02-28', end: '2026-03-30' });
  assert.deepEqual(salaryCycle('2026-01-01', 25), { start: '2025-12-25', end: '2026-01-24' });
  assert.equal(vietnamDate(new Date('2026-10-06T18:00:00Z')), '2026-10-07');
});

test('archived current expenses are included and orphan expenses make the assessment incomplete', () => {
  const data = { monthlyIncome: 1000, activeCycleStart: '2026-09-25', jars: [{ id: 'nec', code: 'NEC', targetBudget: 1000 } as any],
    preferences: { monthlyResetDay: 25 }, transactions: [{ type: 'expense', date: '2026-10-01', amount: 2000, jarId: 'old' } as any] };
  assert.equal(assessFinance(data, '2026-10-07').score, null);
  const known = assessFinance({ ...data, archivedJars: [{ id: 'old', code: 'OLD', targetBudget: 1000 } as any] }, '2026-10-07');
  assert.equal(known.mood, 'attention');
  assert.ok(known.score! < 85);
});

test('legacy malformed summary shapes cannot crash assessment or reward reconciliation', () => {
  const malformed = { ...summary(), spendingByJar: {} } as any;
  assert.deepEqual(eligibleAwards({ monthlySummaries: [null, { cycleStart: 5 }, malformed] as any }, '2026-09-25', '2026-10-25'), {});
  assert.equal(assessFinance({ monthlySummaries: [malformed] }, '2026-10-25', '2026-09-25').score, null);
});

test('persisted previous-cycle budgets remain neutral until rollover is saved', () => {
  const data = { monthlyIncome: 1000, activeCycleStart: '2026-08-25',
    jars: [{ id: 'nec', code: 'NEC', targetBudget: 1000 } as any], preferences: { monthlyResetDay: 25 },
    transactions: [{ type: 'expense', date: '2026-10-01', amount: 100, jarId: 'nec' } as any] };
  assert.equal(assessFinance(data, '2026-10-07').score, null);
  assert.equal(assessFinance({ ...data, activeCycleStart: '2026-09-25' }, '2026-10-07').mood, 'happy');
});
