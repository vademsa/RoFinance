import { randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ENGAGEMENT_POINTS } from '../shared/communityPlans';
import {
  CHARACTERS, CHARACTER_GENDERS, COSMETICS, DEFAULT_EQUIPMENT, DRAW_COST, EXCHANGE_COST, RULES_VERSION,
  RECYCLE_COPIES, FUSE_COPIES, RARITIES,
  assessFinance, calendarDate, canExchangeCosmetic, DRAW_TICKETS, eligibleAwards, getDrawPool, getDrawRarity, pointsForState, salaryCycle, selectDrawItem, validateEquipment, vietnamDate,
  type CharacterProfile, type CharacterState, type DrawResult, type FinanceForCharacter, type LeaderboardEntry,
  type MaterialKind, type ItemMaterial, type MaterialResult,
} from '../shared/character';

export class CharacterError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function requireKeys(value: unknown, keys: string[], required: string[] = []): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)) || required.some((key) => !(key in value))) throw new CharacterError('INVALID_INPUT');
  return value;
}
export function validateRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new CharacterError('INVALID_REQUEST_ID');
  return value.toLowerCase();
}
export function newCharacter(data: FinanceForCharacter, today: string, now = new Date()): CharacterState {
  return {
    version: 1, characterId: 'sun', gender: 'male', nickname: 'Companion', optIn: false,
    equipped: { ...DEFAULT_EQUIPMENT }, ownedItemIds: COSMETICS.filter((item) => item.starter).map((item) => item.id),
    fragments: 0, spentPoints: 0, drawCount: 0, pityCount: 0,
    enrolledCycleStart: salaryCycle(today, data.preferences?.monthlyResetDay || 1).start,
    enrolledAt: now.toISOString(), awards: {},
  };
}
export function updateCharacter(state: CharacterState, body: unknown): CharacterState {
  const input = requireKeys(body, ['characterId', 'gender', 'nickname', 'optIn', 'equipped']);
  if (!Object.keys(input).length) throw new CharacterError('INVALID_INPUT');
  const next = { ...state };
  if ('gender' in input) {
    if (!CHARACTER_GENDERS.some(gender => gender === input.gender)) throw new CharacterError('INVALID_GENDER');
    next.gender = input.gender as CharacterState['gender'];
  }
  if ('characterId' in input) {
    if (!CHARACTERS.some((item) => item.id === input.characterId)) throw new CharacterError('INVALID_CHARACTER');
    next.characterId = input.characterId as CharacterState['characterId'];
  }
  if ('nickname' in input) {
    if (typeof input.nickname !== 'string') throw new CharacterError('INVALID_NICKNAME');
    const name = input.nickname.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (!/^[\p{L}\p{N} ._-]{2,24}$/u.test(name) || /[\u0000-\u001f\u007f]/u.test(input.nickname)) throw new CharacterError('INVALID_NICKNAME');
    next.nickname = name;
  }
  if ('optIn' in input) {
    if (typeof input.optIn !== 'boolean') throw new CharacterError('INVALID_INPUT');
    next.optIn = input.optIn;
  }
  if ('equipped' in input) {
    const equipment = validateEquipment(input.equipped, state.ownedItemIds);
    if (!equipment) throw new CharacterError('UNOWNED_EQUIPMENT');
    next.equipped = equipment;
  }
  return next;
}
export function activateCharacterEnrollment(state: CharacterState, data: FinanceForCharacter, today: string, now = new Date()): CharacterState {
  if (!state.pendingEnrollment) return state;
  const { pendingEnrollment: _pending, ...original } = state;
  return { ...original, enrolledCycleStart: salaryCycle(today, data.preferences?.monthlyResetDay || 1).start, enrolledAt: now.toISOString() };
}
export function drawCharacter(state: CharacterState, roll = randomInt(DRAW_TICKETS), itemIndex?: number) {
  if (pointsForState(state).availablePoints < DRAW_COST) throw new CharacterError('NOT_ENOUGH_POINTS', 409);
  const rarity = getDrawRarity(roll);
  const chosen = selectDrawItem(roll, itemIndex ?? (rarity === 'none' ? 0 : randomInt(getDrawPool(rarity).length)));
  const duplicate = Boolean(chosen.item && state.ownedItemIds.includes(chosen.item.id));
  if (duplicate && chosen.item && (!Number.isSafeInteger(state.duplicateItemCounts?.[chosen.item.id] ?? 0) || (state.duplicateItemCounts?.[chosen.item.id] ?? 0) < 0 || (state.duplicateItemCounts?.[chosen.item.id] ?? 0) >= Number.MAX_SAFE_INTEGER)) throw new CharacterError('INVALID_INVENTORY');
  const next: CharacterState = {
    ...state, spentPoints: state.spentPoints + DRAW_COST, drawCount: state.drawCount + 1, pityCount: chosen.pityCount,
    fragments: state.fragments,
    duplicateItemCounts: { ...state.duplicateItemCounts, ...(duplicate && chosen.item ? { [chosen.item.id]: (state.duplicateItemCounts?.[chosen.item.id] ?? 0) + 1 } : {}) },
    ownedItemIds: duplicate || !chosen.item ? [...state.ownedItemIds] : [...state.ownedItemIds, chosen.item.id],
  };
  const result: DrawResult = { itemId: chosen.item?.id ?? null, duplicate, fragments: 0, guaranteed: chosen.guaranteed };
  return { state: next, result };
}
export function exchangeCharacter(state: CharacterState, itemId: unknown): CharacterState {
  if (typeof itemId !== 'string' || !COSMETICS.some((item) => item.id === itemId && canExchangeCosmetic(item))) throw new CharacterError('INVALID_ITEM');
  if (state.ownedItemIds.includes(itemId)) throw new CharacterError('ALREADY_OWNED', 409);
  if (state.fragments < EXCHANGE_COST) throw new CharacterError('NOT_ENOUGH_FRAGMENTS', 409);
  return { ...state, fragments: state.fragments - EXCHANGE_COST, ownedItemIds: [...state.ownedItemIds, itemId] };
}
/** Canonical exact-size input; never accept client rarity, points or output IDs. */
export function validateMaterials(kind: MaterialKind, value: unknown): ItemMaterial[] {
  const needed = kind === 'recycle' ? RECYCLE_COPIES : FUSE_COPIES;
  if (!Array.isArray(value) || !value.length || value.length > needed) throw new CharacterError('INVALID_MATERIALS');
  const seen = new Set<string>();
  const materials = value.map((entry) => {
    const input = requireKeys(entry, ['itemId', 'count'], ['itemId', 'count']);
    const item = COSMETICS.find((candidate) => candidate.id === input.itemId && !candidate.starter);
    if (!item || seen.has(item.id) || !Number.isSafeInteger(input.count) || Number(input.count) < 1 || Number(input.count) > needed) throw new CharacterError('INVALID_MATERIALS');
    seen.add(item.id);
    return { itemId: item.id, count: Number(input.count) };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId));
  if (materials.reduce((sum, item) => sum + item.count, 0) !== needed) throw new CharacterError('INVALID_MATERIALS');
  if (kind === 'fuse') {
    const rarity = COSMETICS.find((item) => item.id === materials[0].itemId)!.rarity;
    if (rarity === 'legendary') throw new CharacterError('MAX_RARITY');
    if (materials.some((entry) => COSMETICS.find((item) => item.id === entry.itemId)!.rarity !== rarity)) throw new CharacterError('MIXED_RARITY');
  }
  return materials;
}
export function transformDuplicates(state: CharacterState, kind: MaterialKind, value: unknown, itemIndex?: number) {
  const materials = validateMaterials(kind, value);
  const duplicateItemCounts = { ...state.duplicateItemCounts };
  for (const entry of materials) {
    if (!state.ownedItemIds.includes(entry.itemId) || !Number.isSafeInteger(duplicateItemCounts[entry.itemId] ?? 0) || (duplicateItemCounts[entry.itemId] ?? 0) < entry.count) throw new CharacterError('NOT_ENOUGH_DUPLICATES', 409);
    duplicateItemCounts[entry.itemId] -= entry.count;
    if (!duplicateItemCounts[entry.itemId]) delete duplicateItemCounts[entry.itemId];
  }
  const next: CharacterState = { ...state, duplicateItemCounts };
  const result: MaterialResult = { kind, consumed: materials, points: 0, itemId: null, duplicate: false };
  if (kind === 'recycle') {
    next.recycledPoints = (state.recycledPoints ?? 0) + DRAW_COST;
    if (!Number.isSafeInteger(next.recycledPoints)) throw new CharacterError('INVALID_INVENTORY');
    result.points = DRAW_COST;
  } else {
    const source = COSMETICS.find((item) => item.id === materials[0].itemId)!;
    const pool = getDrawPool(RARITIES[RARITIES.indexOf(source.rarity) + 1]);
    const index = itemIndex ?? randomInt(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new CharacterError('INVALID_ITEM');
    const item = pool[index];
    result.itemId = item.id;
    result.duplicate = state.ownedItemIds.includes(item.id);
    if (result.duplicate) {
      const copies = duplicateItemCounts[item.id] ?? 0;
      if (!Number.isSafeInteger(copies) || copies < 0 || copies >= Number.MAX_SAFE_INTEGER) throw new CharacterError('INVALID_INVENTORY');
      duplicateItemCounts[item.id] = copies + 1;
    }
    else next.ownedItemIds = [...state.ownedItemIds, item.id];
  }
  return { state: next, result };
}
export function privateProfile(state: CharacterState, data: FinanceForCharacter, today: string, selectedStart?: string): CharacterProfile {
  const lifetimeScore = Object.values(state.awards).reduce((sum, item) => sum + item.score, 0);
  return { ...state, gender: state.gender ?? 'male', ...pointsForState(state), lifetimeScore, level: 1 + Math.floor(lifetimeScore / 100),
    assessment: assessFinance(data, today, selectedStart), rulesVersion: RULES_VERSION };
}
export function publicRanking(row: Record<string, unknown>): LeaderboardEntry {
  // Explicit projection. Never spread database rows or finance objects into this DTO.
  const equipment = validateEquipment(row.equipment, COSMETICS.map((item) => item.id));
  return { rank: Number(row.rank), nickname: String(row.nickname),
    gender: row.gender === 'female' ? 'female' : 'male',
    characterId: CHARACTERS.some((item) => item.id === row.character_id) ? row.character_id as CharacterState['characterId'] : 'sun',
    equipped: equipment || { ...DEFAULT_EQUIPMENT }, score: Number(row.score) };
}
async function persistCharacter(db: PoolClient, owner: string, state: CharacterState) {
  await db.query(`INSERT INTO character_profiles (user_id, state) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`, [owner, JSON.stringify(state)]);
  await db.query('DELETE FROM character_rankings WHERE user_id = $1', [owner]);
  if (!state.optIn) return;
  for (const [season, award] of Object.entries(state.awards)) {
    await db.query(`INSERT INTO character_rankings (user_id, season, nickname, character_id, equipment, score, gender)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [owner, season, state.nickname, state.characterId, JSON.stringify(state.equipped), award.score, state.gender ?? 'male']);
  }
}
export function hasNewDailyExpense(data: FinanceForCharacter, previous: FinanceForCharacter, today: string) {
  const old = new Map((previous.transactions || []).map(t => [t.id, t]));
  return (data.transactions || []).some(t => {
    const prior = old.get(t.id);
    return t.type === 'expense' && t.date === today && Number.isFinite(t.amount) && t.amount > 0 && (!prior || prior.type !== 'expense' || prior.date !== today);
  });
}
export async function grantEngagementReward(db: PoolClient, owner: string, kind: 'daily' | 'adoption', key: string, today = vietnamDate()) {
  // Caller holds this owner's advisory lock; unique ledger and profile update share its transaction.
  const claim = await db.query('INSERT INTO engagement_reward_claims (user_id,kind,reward_key,points) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING user_id', [owner, kind, key, ENGAGEMENT_POINTS]);
  if (!claim.rowCount) return false;
  const saved = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id = $1 FOR UPDATE', [owner]);
  const state = saved.rows[0]?.state || { ...newCharacter({}, today), pendingEnrollment: true };
  const bonusPoints = (state.bonusPoints ?? 0) + ENGAGEMENT_POINTS;
  if (!Number.isSafeInteger(bonusPoints) || !Number.isSafeInteger(pointsForState({ ...state, bonusPoints }).availablePoints)) throw new CharacterError('POINT_LIMIT', 409);
  await persistCharacter(db, owner, { ...state, bonusPoints });
  return true;
}
export async function syncCharacterForSavedFinance(db: PoolClient, owner: string, data: FinanceForCharacter, today = vietnamDate(), previous?: FinanceForCharacter) {
  const dailyRewardGranted = Boolean(previous && hasNewDailyExpense(data, previous, today) && await grantEngagementReward(db, owner, 'daily', today, today));
  const saved = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id = $1 FOR UPDATE', [owner]);
  const state = saved.rows[0]?.state;
  if (!state || state.pendingEnrollment) return dailyRewardGranted;
  await persistCharacter(db, owner, { ...state, awards: eligibleAwards(data, state.enrolledCycleStart, today) });
  return dailyRewardGranted;
}
export class CharacterStore {
  constructor(private pool: Pool, private today: () => string = vietnamDate,
    private draw: (state: CharacterState) => { state: CharacterState; result: DrawResult } = drawCharacter) {}
  private async withOwner<T>(owner: string, action: (db: PoolClient, state: CharacterState, data: FinanceForCharacter, today: string) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
      const finance = await db.query<{ data: FinanceForCharacter }>('SELECT data FROM user_data WHERE user_id = $1', [owner]);
      const data = isRecord(finance.rows[0]?.data) ? finance.rows[0].data : {};
      const saved = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id = $1 FOR UPDATE', [owner]);
      const today = this.today();
      const original = activateCharacterEnrollment(saved.rows[0]?.state || newCharacter(data, today), data, today);
      const state = { ...original, awards: eligibleAwards(data, original.enrolledCycleStart, today) };
      const result = await action(db, state, data, today);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  }
  profile(owner: string, selectedStart?: string) {
    return this.withOwner(owner, async (db, state, data, today) => {
      if (selectedStart !== undefined && (!calendarDate(selectedStart) || !(Array.isArray(data.monthlySummaries) && data.monthlySummaries.some((item) => item?.cycleStart === selectedStart)))) throw new CharacterError('INVALID_CYCLE');
      await persistCharacter(db, owner, state);
      return privateProfile(state, data, today, selectedStart);
    });
  }
  update(owner: string, body: unknown) {
    return this.withOwner(owner, async (db, state, data, today) => {
      const next = updateCharacter(state, body);
      await persistCharacter(db, owner, next);
      return privateProfile(next, data, today);
    });
  }
  action(owner: string, kind: 'draw' | 'exchange' | MaterialKind, body: unknown) {
    if (!['draw', 'exchange', 'recycle', 'fuse'].includes(kind)) throw new CharacterError('INVALID_INPUT');
    const keys = kind === 'draw' ? ['requestId'] : kind === 'exchange' ? ['requestId', 'itemId'] : ['requestId', 'items'];
    const input = requireKeys(body, keys, keys);
    const requestId = validateRequestId(input.requestId);
    if (kind === 'exchange' && (typeof input.itemId !== 'string' || !COSMETICS.some((item) => item.id === input.itemId && canExchangeCosmetic(item)))) throw new CharacterError('INVALID_ITEM');
    const materials = kind === 'recycle' || kind === 'fuse' ? validateMaterials(kind, input.items) : null;
    const fingerprint = `${kind}:${materials ? JSON.stringify(materials) : kind === 'exchange' ? String(input.itemId) : ''}`;
    return this.withOwner(owner, async (db, state, data, today) => {
      const existing = await db.query<{ fingerprint: string; result: DrawResult | { itemId: string } | MaterialResult }>(
        'SELECT fingerprint, result FROM character_actions WHERE user_id = $1 AND request_id = $2', [owner, requestId]);
      if (existing.rows[0]) {
        if (existing.rows[0].fingerprint !== fingerprint) throw new CharacterError('REQUEST_ID_CONFLICT', 409);
        await persistCharacter(db, owner, state);
        return { profile: privateProfile(state, data, today), result: existing.rows[0].result };
      }
      const outcome = kind === 'draw' ? this.draw(state) : kind === 'exchange' ? { state: exchangeCharacter(state, input.itemId), result: { itemId: String(input.itemId) } }
        : transformDuplicates(state, kind, materials);
      await persistCharacter(db, owner, outcome.state);
      await db.query('INSERT INTO character_actions (user_id, request_id, fingerprint, result) VALUES ($1, $2, $3, $4)',
        [owner, requestId, fingerprint, JSON.stringify(outcome.result)]);
      return { profile: privateProfile(outcome.state, data, today), result: outcome.result };
    });
  }
  async leaderboard(season: string) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(season)) throw new CharacterError('INVALID_SEASON');
    const rows = await this.pool.query(`SELECT nickname, character_id, gender, equipment, score,
      RANK() OVER (ORDER BY score DESC) AS rank FROM character_rankings
      WHERE season = $1 ORDER BY score DESC, nickname ASC, character_id ASC LIMIT 50`, [season]);
    return { season, entries: rows.rows.map(publicRanking) };
  }
}
