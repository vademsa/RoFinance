import type { Jar, MonthlyCycleSummary, Transaction } from '../src/types';
import { isBankOnlyExpense } from './transactions';

export const ITEM_SLOTS = ['shirt', 'hat', 'shoes', 'hair', 'face', 'expression', 'backpack'] as const;
export type ItemSlot = typeof ITEM_SLOTS[number];
export const RARITIES = ['common', 'rare', 'special', 'legendary'] as const;
export type Rarity = typeof RARITIES[number];
export type Mood = 'happy' | 'steady' | 'worried' | 'attention';
export const CHARACTERS = [
  { id: 'sun', vi: 'Nắng', en: 'Sunny', skin: '#edbc96' },
  { id: 'river', vi: 'Sông', en: 'River', skin: '#c78f66' },
  { id: 'leaf', vi: 'Lá', en: 'Leaf', skin: '#8d593d' },
  { id: 'cloud', vi: 'Mây', en: 'Cloud', skin: '#f3d1b5' },
] as const;
export type CharacterId = typeof CHARACTERS[number]['id'];
export const CHARACTER_GENDERS = ['male', 'female'] as const;
export type CharacterGender = typeof CHARACTER_GENDERS[number];
export type CosmeticGender = CharacterGender | 'unisex';
export const cosmeticGender = (item: Cosmetic): CosmeticGender => item.gender ?? 'unisex';
export type Equipment = Record<ItemSlot, string | null>;
export interface Cosmetic { id: string; slot: ItemSlot; rarity: Rarity; color: string; vi: string; en: string; variant: number; gender?: CosmeticGender; starter?: boolean; secret?: boolean; exclusive?: boolean }
const slotNames: Record<ItemSlot, [string, string]> = {
  shirt: ['Áo', 'Shirt'], hat: ['Mũ', 'Hat'], shoes: ['Giày', 'Shoes'], hair: ['Tóc', 'Hair'],
  face: ['Gương mặt', 'Face'], expression: ['Biểu cảm', 'Expression'], backpack: ['Balo', 'Backpack'],
};
export const COSMETICS: Cosmetic[] = [...ITEM_SLOTS.flatMap((slot) => [
  { id: `${slot}-basic`, slot, rarity: 'common' as const, color: '#6366f1', vi: `${slotNames[slot][0]} cơ bản`, en: `Basic ${slotNames[slot][1].toLowerCase()}`, variant: 0, starter: true },
  { id: `${slot}-mint`, slot, rarity: 'common' as const, color: '#10b981', vi: `${slotNames[slot][0]} xanh ngọc`, en: `Mint ${slotNames[slot][1].toLowerCase()}`, variant: 1 },
  { id: `${slot}-rose`, slot, rarity: 'rare' as const, color: '#f472b6', vi: `${slotNames[slot][0]} hồng`, en: `Rose ${slotNames[slot][1].toLowerCase()}`, variant: 2 },
  { id: `${slot}-gold`, slot, rarity: 'special' as const, color: '#fbbf24', vi: `${slotNames[slot][0]} ánh sao`, en: `Starlight ${slotNames[slot][1].toLowerCase()}`, variant: 3 },
]),
  { id: 'hat-comet', slot: 'hat', rarity: 'legendary', color: '#8b5cf6', vi: 'Mũ sao chổi', en: 'Comet crown', variant: 4, secret: true },
  { id: 'shirt-aurora', slot: 'shirt', rarity: 'legendary', color: '#0d9488', vi: 'Áo cực quang', en: 'Aurora jacket', variant: 4, secret: true },
  { id: 'backpack-orbit', slot: 'backpack', rarity: 'legendary', color: '#7c3aed', vi: 'Balo quỹ đạo', en: 'Orbital backpack', variant: 4, secret: true },
  ...([
    ['denim', 'Denim', 'Denim', 'common', '#2563eb', 5],
    ['sunset', 'hoàng hôn', 'Sunset', 'common', '#ea580c', 6],
    ['forest', 'rừng xanh', 'Forest', 'common', '#059669', 7],
    ['sailor', 'thủy thủ', 'Sailor', 'common', '#0891b2', 8],
    ['neon', 'Neon', 'Neon', 'rare', '#84cc16', 9],
    ['sakura', 'hoa anh đào', 'Sakura', 'rare', '#ec4899', 10],
    ['winter', 'mùa đông', 'Winter', 'rare', '#64748b', 11],
    ['royal', 'hoàng gia', 'Royal', 'special', '#9333ea', 12],
    ['celestial', 'thiên hà', 'Celestial', 'legendary', '#4f46e5', 13],
    ['phoenix', 'phượng hoàng', 'Phoenix', 'legendary', '#dc2626', 14],
  ] as const).flatMap(([id, vi, en, rarity, color, variant]) => ITEM_SLOTS.map((slot) => ({
    id: `${slot}-${id}`, slot, rarity, color, variant,
    vi: `${slotNames[slot][0]} ${vi}`, en: `${en} ${slotNames[slot][1].toLowerCase()}`,
  }))),
  { id: 'hat-singularity', slot: 'hat', rarity: 'legendary', color: '#312e81', vi: 'Mũ hố đen', en: 'Singularity crown', variant: 15, secret: true },
  { id: 'backpack-dragon', slot: 'backpack', rarity: 'legendary', color: '#b91c1c', vi: 'Balo long thần', en: 'Dragon pack', variant: 16, secret: true },
  { id: 'expression-astral', slot: 'expression', rarity: 'legendary', color: '#c084fc', vi: 'Biểu cảm tinh tú', en: 'Astral expression', variant: 17, secret: true },
  { id: 'shirt-eclipse', slot: 'shirt', rarity: 'legendary', color: '#0f172a', vi: 'Áo nhật thực', en: 'Eclipse coat', variant: 18, secret: true },
  ...ITEM_SLOTS.map((slot) => ({ id: `${slot}-rofinance`, slot, rarity: 'legendary' as const,
    color: '#cbd5e1', vi: `${slotNames[slot][0]} RoFinance Signature`, en: `RoFinance Signature ${slotNames[slot][1].toLowerCase()}`,
    variant: 19, exclusive: true })),
  ...CHARACTER_GENDERS.flatMap((gender) => ITEM_SLOTS.map((slot) => {
    const names: Record<ItemSlot, [string, string, string, string]> = {
      shirt: ['Áo vest nam', "Men's classic blazer", 'Váy xếp ly nữ', "Women's pleated dress"],
      hat: ['Mũ beret nam', "Men's beret", 'Mũ nơ nữ', "Women's bow hat"],
      shoes: ['Giày loafer nam', "Men's loafers", 'Giày búp bê nữ', "Women's ballet flats"],
      hair: ['Tóc undercut nam', "Men's undercut", 'Tóc đuôi ngựa nữ', "Women's ponytail"],
      face: ['Kính thanh lịch nam', "Men's classic glasses", 'Gương mặt thanh lịch nữ', "Women's classic face"],
      expression: ['Nụ cười tự tin nam', "Men's confident smile", 'Nụ cười dịu dàng nữ', "Women's gentle smile"],
      backpack: ['Túi đeo chéo nam', "Men's messenger bag", 'Balo mini nữ', "Women's mini backpack"],
    };
    const female = gender === 'female';
    return { id: `${slot}-${gender}-classic`, slot, gender, rarity: 'common' as const,
      color: slot === 'hair' ? '#49382c' : female ? '#be527c' : '#315c85',
      vi: names[slot][female ? 2 : 0], en: names[slot][female ? 3 : 1], variant: female ? 21 : 20 };
  })),
];
// Two million integer tickets represent a 35% item chance exactly while keeping
// the previous rarity mix (85% / 14.5% / 0.495% / 0.005% of winning draws).
// Rare probabilities stay reachable without rounding or changing item pools.
export const DRAW_TICKETS = 2_000_000;
export const NO_PRIZE_TICKETS = 1_300_000;
export const RARITY_TICKETS: Record<Rarity, number> = { common: 595_000, rare: 101_500, special: 3_465, legendary: 35 };
export const canExchangeCosmetic = (item: Cosmetic) => !item.starter && !item.secret && item.rarity !== 'legendary';
export const DRAW_COST = 20;
export const RECYCLE_COPIES = 2;
export const FUSE_COPIES = 7;
export type MaterialKind = 'recycle' | 'fuse';
export interface ItemMaterial { itemId: string; count: number }
export interface MaterialResult { kind: MaterialKind; consumed: ItemMaterial[]; points: number; itemId: string | null; duplicate: boolean }
export const EXCHANGE_COST = 20;
export const WELCOME_POINTS = 40;
export const RULES_VERSION = 1;
export const DEFAULT_EQUIPMENT = Object.fromEntries(ITEM_SLOTS.map((slot) => [slot, `${slot}-basic`])) as Equipment;
export interface Assessment {
  mood: Mood; score: number | null; eligible: boolean; reasons: string[]; cycleStart: string; cycleEnd: string;
}
export interface CycleAward { score: number; points: number; cycleStart: string; cycleEnd: string }
export interface CharacterState {
  /** Admin gifts may create inventory before the user's first character visit.
   * Enrollment is rebased server-side at first use; never client-writable. */
  pendingEnrollment?: boolean;
  version: 1; characterId: CharacterId; nickname: string; optIn: boolean; equipped: Equipment;
  /** Legacy profiles omit this cosmetic preference and keep the original male silhouette. */
  gender?: CharacterGender;
  ownedItemIds: string[]; fragments: number; spentPoints: number; drawCount: number;
  /** Legacy storage field only. Draws no longer use a pity/insurance system. */
  pityCount: number;
  enrolledCycleStart: string; enrolledAt: string; awards: Record<string, CycleAward>;
  /** Server-issued daily/community/Admin credit, never a financial ranking score. Older states default to zero. */
  bonusPoints?: number;
  /** Audited Admin deductions; never erase spending, financial awards or ranking scores. */
  revokedPoints?: number;
  /** Server-owned spare copies only; the original owned/equipped copy is never consumed. */
  duplicateItemCounts?: Record<string, number>;
  /** Points earned by consuming spare copies, separate from operator test credit. */
  recycledPoints?: number;
}
export interface CharacterProfile extends CharacterState {
  availablePoints: number; pointsShortfall: number; lifetimeScore: number; level: number;
  assessment: Assessment; rulesVersion: number;
}
export interface DrawResult { itemId: string | null; duplicate: boolean; fragments: number; guaranteed: boolean }
export interface LeaderboardEntry { rank: number; nickname: string; characterId: CharacterId; gender?: CharacterGender; equipped: Equipment; score: number }
export type FinanceForCharacter = {
  monthlyIncome?: number; activeCycleStart?: string; preferences?: { monthlyResetDay?: number };
  jars?: Jar[]; archivedJars?: Jar[]; transactions?: Transaction[]; monthlySummaries?: MonthlyCycleSummary[];
};
export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function vietnamDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const key = (date: Date) => date.toISOString().slice(0, 10);
export function salaryCycle(date: string, resetDay: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = Math.min(31, Math.max(1, Math.trunc(resetDay) || 1));
  const boundary = (offset: number) => {
    const first = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)));
  };
  const start = boundary(0) > parsed ? boundary(-1) : boundary(0);
  const end = boundary(start.getUTCMonth() === parsed.getUTCMonth() ? 1 : 0);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: key(start), end: key(end) };
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const finiteMoney = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e15;
type Budget = { available: number; spent: number; code: string; archived?: boolean };
export function assessBudgets(budgets: Budget[], income: number, start: string, end: string, today: string, expenseCount: number): Assessment {
  const neutral: Assessment = { mood: 'steady', score: null, eligible: false, reasons: ['incomplete'], cycleStart: start, cycleEnd: end };
  if (!calendarDate(start) || !calendarDate(end) || !calendarDate(today) || start > end || !finiteMoney(income) || income <= 0 || !budgets.length ||
    budgets.some((item) => !finiteMoney(item.available) || !finiteMoney(item.spent))) return neutral;
  // Unspent archived funds were moved into active jars by a plan change.
  // Only consumed budget belongs here, avoiding counting the same remaining money twice.
  budgets = budgets.map((item) => item.archived ? { ...item, available: Math.min(item.available, item.spent) } : item);
  const available = budgets.reduce((sum, item) => sum + item.available, 0);
  const spent = budgets.reduce((sum, item) => sum + item.spent, 0);
  if (available <= 0 || !Number.isFinite(available + spent)) return neutral;
  const active = budgets.filter((item) => !item.archived);
  const activeAvailable = active.reduce((sum, item) => sum + item.available, 0);
  const remaining = active.reduce((sum, item) => sum + Math.max(0, item.available - item.spent), 0);
  const overrun = budgets.reduce((sum, item) => sum + Math.max(0, item.spent - item.available), 0);
  const adherence = clamp(1 - overrun / Math.max(income, spent, 1));
  const compliant = budgets.filter((item) => item.available > 0 && item.spent <= item.available).length;
  const funded = budgets.filter((item) => item.available > 0).length;
  const buffer = clamp(remaining / Math.max(activeAvailable, 1) / 0.2);
  const score = Math.round(60 * adherence + 25 * compliant / Math.max(1, funded) + 15 * buffer);
  const length = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const progress = clamp(((Date.parse(today) - Date.parse(start)) / 86400000 + 1) / length);
  const essentials = active.filter((item) => item.code === 'NEC');
  const emptyEssentials = progress < 0.9 && essentials.some((item) => item.available > 0 && item.spent >= item.available);
  const pace = spent / available;
  const reasons: string[] = [];
  let mood: Mood = 'steady';
  if (overrun > 0 || emptyEssentials) { mood = 'attention'; reasons.push(overrun > 0 ? 'overBudget' : 'essentialLow'); }
  else if (progress < 1 && pace > progress + 0.2) { mood = 'worried'; reasons.push('fastPace'); }
  else if (expenseCount > 0 && score >= 85) { mood = 'happy'; reasons.push('onTrack'); }
  else reasons.push('steady');
  const eligible = end < today && length >= 25 && length <= 32 && expenseCount > 0 && spent > 0;
  return { mood, score: expenseCount > 0 ? score : null, eligible, reasons, cycleStart: start, cycleEnd: end };
}
export function assessSummary(summary: MonthlyCycleSummary, today: string): Assessment {
  if (!summary || !Array.isArray(summary.jarBreakdown) || !Array.isArray(summary.spendingByJar) ||
    !finiteMoney(summary.expense) || summary.jarBreakdown.some((item) => !item || typeof item !== 'object') ||
    summary.spendingByJar.some((item) => !item || !finiteMoney(item.amount))) {
    return { mood: 'steady', score: null, eligible: false, reasons: ['incomplete'],
      cycleStart: calendarDate(summary?.cycleStart) ? summary.cycleStart : '', cycleEnd: calendarDate(summary?.cycleEnd) ? summary.cycleEnd : '' };
  }
  const expenses = summary.expense > 0 ? summary.spendingByJar.filter((item) => item.amount > 0).length : 0;
  return assessBudgets(summary.jarBreakdown.map((item) => ({
    available: item.availableBudget, spent: item.spent, code: item.jarCode, archived: item.isArchived,
  })), Math.max(0, summary.income - (summary.unallocatedIncome || 0)), summary.cycleStart, summary.cycleEnd, today, expenses);
}
export function assessFinance(data: FinanceForCharacter, today: string, selectedStart?: string): Assessment {
  const cycle = salaryCycle(today, data.preferences?.monthlyResetDay || 1);
  const summaries = Array.isArray(data.monthlySummaries) ? data.monthlySummaries : [];
  const historical = selectedStart && summaries.find((item) => item?.cycleStart === selectedStart);
  if (historical) return assessSummary(historical, today);
  if (data.activeCycleStart !== cycle.start) {
    return { mood: 'steady', score: null, eligible: false, reasons: ['incomplete'], cycleStart: cycle.start, cycleEnd: cycle.end };
  }
  const transactions = (Array.isArray(data.transactions) ? data.transactions : []).filter((item) => item?.type === 'expense' && !isBankOnlyExpense(item) && item.date >= cycle.start && item.date <= today);
  const active = (Array.isArray(data.jars) ? data.jars : []).filter((jar) => jar && typeof jar.id === 'string');
  const archived = (Array.isArray(data.archivedJars) ? data.archivedJars : []).filter((jar) => jar && typeof jar.id === 'string' && !active.some((item) => item.id === jar.id));
  if (transactions.some((item) => !finiteMoney(item.amount) || ![...active, ...archived].some((jar) => jar.id === item.jarId))) {
    return { mood: 'steady', score: null, eligible: false, reasons: ['incomplete'], cycleStart: cycle.start, cycleEnd: cycle.end };
  }
  return assessBudgets([...active.map((jar) => ({ jar, archived: false })), ...archived.map((jar) => ({ jar, archived: true }))].map(({ jar, archived }) => ({ available: jar.targetBudget,
    spent: transactions.filter((item) => item.jarId === jar.id).reduce((sum, item) => sum + item.amount, 0), code: jar.code, archived })),
  data.monthlyIncome || 0, cycle.start, cycle.end, today, transactions.length);
}
export function eligibleAwards(data: FinanceForCharacter, enrolledStart: string, today: string): Record<string, CycleAward> {
  const result: Record<string, CycleAward> = {};
  let lastEnd = '';
  const summaries = (Array.isArray(data.monthlySummaries) ? [...data.monthlySummaries] : [])
    .filter((item) => item && calendarDate(item.cycleStart) && calendarDate(item.cycleEnd))
    .sort((a, b) => a.cycleStart.localeCompare(b.cycleStart) || a.cycleEnd.localeCompare(b.cycleEnd));
  for (const summary of summaries) {
    if (summary.cycleStart < enrolledStart || summary.cycleStart <= lastEnd) continue;
    const assessment = assessSummary(summary, today);
    const season = summary.cycleEnd.slice(0, 7);
    if (!assessment.eligible || assessment.score === null || result[season]) continue;
    result[season] = { score: assessment.score, points: Math.floor(assessment.score / 5), cycleStart: summary.cycleStart, cycleEnd: summary.cycleEnd };
    lastEnd = summary.cycleEnd;
  }
  return result;
}
export function pointsForState(state: CharacterState) {
  const earned = WELCOME_POINTS + (state.bonusPoints ?? 0) + (state.recycledPoints ?? 0) + Object.values(state.awards).reduce((sum, item) => sum + item.points, 0);
  const remaining = earned - (state.revokedPoints ?? 0) - state.spentPoints;
  return { availablePoints: Math.max(0, remaining), pointsShortfall: Math.max(0, -remaining) };
}
export function validateEquipment(value: unknown, owned: string[]): Equipment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== ITEM_SLOTS.length || Object.keys(record).some((slot) => !ITEM_SLOTS.includes(slot as ItemSlot))) return null;
  const equipment = {} as Equipment;
  for (const slot of ITEM_SLOTS) {
    const id = record[slot];
    if (id === null && ['hat', 'backpack'].includes(slot)) { equipment[slot] = null; continue; }
    if (typeof id !== 'string' || !owned.includes(id) || !COSMETICS.some((item) => item.id === id && item.slot === slot)) return null;
    equipment[slot] = id;
  }
  return equipment;
}
export function selectDrawItem(roll: number, itemIndex: number, _legacyPityCount = 0) {
  const rarity = getDrawRarity(roll);
  if (rarity === 'none') {
    if (itemIndex !== 0) throw new Error('Invalid draw randomness');
    return { item: null, guaranteed: false, pityCount: 0 };
  }
  const pool = getDrawPool(rarity);
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= pool.length) throw new Error('Invalid draw randomness');
  return { item: pool[itemIndex], guaranteed: false, pityCount: 0 };
}

export function getDrawRarity(roll: number, _legacyPityCount = 0): Rarity | 'none' {
  if (!Number.isInteger(roll) || roll < 0 || roll >= DRAW_TICKETS) throw new Error('Invalid draw randomness');
  if (roll >= DRAW_TICKETS - RARITY_TICKETS.legendary) return 'legendary';
  if (roll >= DRAW_TICKETS - RARITY_TICKETS.legendary - RARITY_TICKETS.special) return 'special';
  if (roll >= NO_PRIZE_TICKETS + RARITY_TICKETS.common) return 'rare';
  return roll < NO_PRIZE_TICKETS ? 'none' : 'common';
}
export const getDrawPool = (rarity: Rarity) => COSMETICS.filter((item) => item.rarity === rarity && !item.starter);
export function getRarityOdds(_legacyPityCount = 0): Record<Rarity, number> {
  return Object.fromEntries(RARITIES.map((rarity) => [rarity, RARITY_TICKETS[rarity] / (DRAW_TICKETS / 100)])) as Record<Rarity, number>;
}
export const getNoPrizeOdds = (_legacyPityCount = 0) => NO_PRIZE_TICKETS / (DRAW_TICKETS / 100);
export function getItemDrawOdds(item: Cosmetic, _legacyPityCount = 0) {
  return item.starter ? 0 : getRarityOdds()[item.rarity] / getDrawPool(item.rarity).length;
}
export const visibleCosmetics = (owned: string[]) => COSMETICS.filter((item) => !item.secret || owned.includes(item.id));
