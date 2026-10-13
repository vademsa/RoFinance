import type { Pool } from 'pg';
import { COSMETICS, type CharacterState } from '../shared/character';
import { CharacterError, validateRequestId } from './characterStore';

/** Local operator tool only: intentionally not exposed through any HTTP route. */
export function applyCharacterTestGrant(state: CharacterState, points: number, fullCollection = false): CharacterState {
  if (!Number.isSafeInteger(points) || points < 1 || points > 100000 || typeof fullCollection !== 'boolean') throw new CharacterError('INVALID_TEST_GRANT');
  const bonusPoints = (state.bonusPoints ?? 0) + points;
  if (!Number.isSafeInteger(bonusPoints) || bonusPoints < points) throw new CharacterError('INVALID_TEST_GRANT');
  return { ...state, bonusPoints, ownedItemIds: fullCollection ? [...new Set([...state.ownedItemIds, ...COSMETICS.map((item) => item.id)])] : state.ownedItemIds };
}

export async function grantCharacterTestPoints(pool: Pool, email: string, points: number, requestId: string, fullCollection = false) {
  const id = validateRequestId(requestId);
  if (typeof email !== 'string' || !email.trim() || !Number.isSafeInteger(points) || points < 1 || points > 100000 || typeof fullCollection !== 'boolean') {
    throw new CharacterError('INVALID_TEST_GRANT');
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const users = await db.query<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (users.rows.length !== 1) throw new CharacterError('TEST_ACCOUNT_NOT_FOUND', 404);
    const owner = users.rows[0].id;
    // Same owner lock as finance saves and draws: no lost updates or reset of inventory/spending.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
    const profiles = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id=$1 FOR UPDATE', [owner]);
    const state = profiles.rows[0]?.state;
    if (!state) throw new CharacterError('CHARACTER_NOT_FOUND', 404);
    const reason = fullCollection ? JSON.stringify({ operation: 'User-requested character full collection testing', itemIds: COSMETICS.map((item) => item.id).sort() }) : 'User-requested character draw testing';
    const existing = await db.query<{ user_id: string; points: number; reason: string }>('SELECT user_id, points, reason FROM character_point_grants WHERE request_id=$1', [id]);
    if (existing.rows[0]) {
      if (existing.rows[0].user_id !== owner || existing.rows[0].points !== points || existing.rows[0].reason !== reason) throw new CharacterError('REQUEST_ID_CONFLICT', 409);
      await db.query('COMMIT');
      return { granted: false, points, bonusPoints: state.bonusPoints ?? 0 };
    }
    const next = applyCharacterTestGrant(state, points, fullCollection);
    await db.query('INSERT INTO character_point_grants (request_id,user_id,points,reason) VALUES ($1,$2,$3,$4)',
      [id, owner, points, reason]);
    await db.query('UPDATE character_profiles SET state=$2, updated_at=NOW() WHERE user_id=$1', [owner, JSON.stringify(next)]);
    await db.query('COMMIT');
    return { granted: true, points, bonusPoints: next.bonusPoints, ...(fullCollection ? { ownedItems: next.ownedItemIds.length } : {}) };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

/** Fusion-test spares only; no credit, legendary items, starters or HTTP route. */
export function applyCharacterTestSpareGrant(state: CharacterState, copies: number): CharacterState {
  if (!Number.isSafeInteger(copies) || copies < 1 || copies > 100) throw new CharacterError('INVALID_TEST_GRANT');
  const items = COSMETICS.filter((item) => !item.starter && item.rarity !== 'legendary');
  const counts = { ...state.duplicateItemCounts };
  for (const item of items) {
    const current = counts[item.id] ?? 0;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + copies)) throw new CharacterError('INVALID_TEST_GRANT');
    counts[item.id] = current + copies;
  }
  return { ...state, ownedItemIds: [...new Set([...state.ownedItemIds, ...items.map((item) => item.id)])], duplicateItemCounts: counts };
}

export async function grantCharacterTestSpares(pool: Pool, email: string, copies: number, requestId: string, dryRun = false) {
  const id = validateRequestId(requestId);
  if (typeof email !== 'string' || !email.trim() || typeof dryRun !== 'boolean' || !Number.isSafeInteger(copies) || copies < 1 || copies > 100) {
    throw new CharacterError('INVALID_TEST_GRANT');
  }
  const itemIds = COSMETICS.filter((item) => !item.starter && item.rarity !== 'legendary').map((item) => item.id).sort();
  const fingerprint = `operator-test-spares:${JSON.stringify({ copies, itemIds })}`;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const users = await db.query<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (users.rows.length !== 1) throw new CharacterError('TEST_ACCOUNT_NOT_FOUND', 404);
    const owner = users.rows[0].id;
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
    const profiles = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id=$1 FOR UPDATE', [owner]);
    const state = profiles.rows[0]?.state;
    if (!state) throw new CharacterError('CHARACTER_NOT_FOUND', 404);
    const existing = await db.query<{ fingerprint: string }>('SELECT fingerprint FROM character_actions WHERE user_id=$1 AND request_id=$2', [owner, id]);
    if (existing.rows[0]) {
      if (existing.rows[0].fingerprint !== fingerprint) throw new CharacterError('REQUEST_ID_CONFLICT', 409);
      await db.query('ROLLBACK');
      return { granted: false, copiesPerItem: copies, itemCount: itemIds.length, totalCopies: itemIds.length * copies };
    }
    const next = applyCharacterTestSpareGrant(state, copies);
    const result = { granted: !dryRun, copiesPerItem: copies, itemCount: itemIds.length, totalCopies: itemIds.length * copies };
    // Operator-only receipt namespace cannot replay as a user draw/fuse/recycle.
    await db.query('INSERT INTO character_actions (user_id,request_id,fingerprint,result) VALUES ($1,$2,$3,$4)', [owner, id, fingerprint, JSON.stringify(result)]);
    await db.query('UPDATE character_profiles SET state=$2, updated_at=NOW() WHERE user_id=$1', [owner, JSON.stringify(next)]);
    await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
