import type { Pool } from 'pg';
import { COSMETICS, DEFAULT_EQUIPMENT, WELCOME_POINTS, pointsForState, vietnamDate, type CharacterState } from '../shared/character';
import type { AdminAccountPage, AdminAuditPage, AdminOperationKind, AdminInventory } from '../shared/admin';
import { ADMIN_ACCOUNT_ID, ADMIN_ACCOUNT_EMAIL } from './adminAccess';
import { CharacterError, newCharacter, requireKeys, validateRequestId } from './characterStore';

const PAGE_SIZE = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function adminListInput(query: unknown, searchAllowed: boolean) {
  const input = requireKeys(query, searchAllowed ? ['page', 'search'] : ['page']);
  const page = input.page === undefined ? 1 : typeof input.page === 'string' && /^[1-9]\d{0,5}$/.test(input.page) ? Number(input.page) : 0;
  if (!page || page > 100000 || input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 100)) throw new CharacterError('INVALID_INPUT');
  return { page, search: typeof input.search === 'string' ? input.search.trim() : '' };
}
export function adminOperationInput(kind: AdminOperationKind, body: unknown) {
  if (!['revoke-sessions', 'grant-points', 'revoke-points', 'grant-item', 'revoke-item'].includes(kind)) throw new CharacterError('INVALID_INPUT');
  const pointAction = kind === 'grant-points' || kind === 'revoke-points';
  const itemAction = kind === 'grant-item' || kind === 'revoke-item';
  const keys = ['requestId', 'targetId', 'reason', ...(pointAction ? ['points'] : itemAction ? ['itemId', 'copies'] : [])];
  const input = requireKeys(body, keys, keys);
  const requestId = validateRequestId(input.requestId);
  if (typeof input.targetId !== 'string' || !UUID.test(input.targetId) || typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 300 || /[\u0000-\u001f\u007f]/.test(input.reason)) throw new CharacterError('INVALID_INPUT');
  const targetId = input.targetId.toLowerCase();
  if (kind === 'revoke-sessions' && targetId === ADMIN_ACCOUNT_ID) throw new CharacterError('ADMIN_SELF_REVOKE_FORBIDDEN', 409);
  if (pointAction && (!Number.isSafeInteger(input.points) || Number(input.points) < 1 || Number(input.points) > 100000)) throw new CharacterError('INVALID_POINTS');
  if (itemAction && (typeof input.itemId !== 'string' || !COSMETICS.some(item => item.id === input.itemId && !item.starter) || !Number.isSafeInteger(input.copies) || Number(input.copies) < 1 || Number(input.copies) > 100)) throw new CharacterError('INVALID_ITEM');
  const reason = input.reason.trim();
  return { requestId, targetId, reason, points: Number(input.points), itemId: String(input.itemId ?? ''), copies: Number(input.copies),
    fingerprint: JSON.stringify({ kind, targetId, reason, ...(pointAction ? { points: input.points } : itemAction ? { itemId: input.itemId, copies: input.copies } : {}) }) };
}

/** No financial table queries or arbitrary JSON patches. All effects and receipts are atomic. */
export class AdminStore {
  constructor(private pool: Pool) {}
  async inventory(targetId: string): Promise<AdminInventory> {
    if (!UUID.test(targetId)) throw new CharacterError('INVALID_INPUT');
    const result = await this.pool.query<{ id: string; state: CharacterState | null }>(`SELECT u.id, c.state FROM users u LEFT JOIN character_profiles c ON c.user_id=u.id WHERE u.id=$1`, [targetId]);
    if (result.rows.length !== 1) throw new CharacterError('ACCOUNT_NOT_FOUND', 404);
    const state = result.rows[0].state;
    const points = state ? { available: pointsForState(state).availablePoints, spent: state.spentPoints, revoked: state.revokedPoints ?? 0 } : { available: 0, spent: 0, revoked: 0 };
    if (Object.values(points).some(value => !Number.isSafeInteger(value) || value < 0)) throw new CharacterError('INVALID_CHARACTER', 409);
    return { targetId: result.rows[0].id, points, items: !state ? [] : COSMETICS.filter(item => state.ownedItemIds.includes(item.id)).map(item => {
      const duplicates = state.duplicateItemCounts?.[item.id] ?? 0;
      if (!Number.isSafeInteger(duplicates) || duplicates < 0 || duplicates >= Number.MAX_SAFE_INTEGER) throw new CharacterError('INVALID_CHARACTER', 409);
      return { itemId: item.id, copies: 1 + duplicates, equipped: Object.values(state.equipped).includes(item.id) };
    }) };
  }
  async accounts(query: unknown): Promise<AdminAccountPage> {
    const { page, search } = adminListInput(query, true);
    // LIKE wildcards are treated as literal characters, not operator input.
    const term = `%${search.replace(/[\\%_]/g, value => `\\${value}`)}%`;
    const rows = await this.pool.query(`SELECT u.id, u.email, u.display_name, u.created_at,
      EXISTS(SELECT 1 FROM character_profiles c WHERE c.user_id=u.id) AS has_character
      FROM users u WHERE email ILIKE $1 OR display_name ILIKE $1
      ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`, [term, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
    const total = await this.pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE email ILIKE $1 OR display_name ILIKE $1`, [term]);
    return { page, pageSize: PAGE_SIZE, total: total.rows[0].total, accounts: rows.rows.map(row => ({
      id: row.id, email: row.email, displayName: row.display_name, createdAt: new Date(row.created_at).toISOString(),
      isOwner: row.id === ADMIN_ACCOUNT_ID, hasCharacter: row.has_character,
    })) };
  }
  async audit(query: unknown): Promise<AdminAuditPage> {
    const { page } = adminListInput(query, false);
    const rows = await this.pool.query(`SELECT request_id, target_id, kind, reason, result, created_at
      FROM admin_operations ORDER BY created_at DESC, request_id LIMIT $1 OFFSET $2`, [PAGE_SIZE, (page - 1) * PAGE_SIZE]);
    const total = await this.pool.query('SELECT COUNT(*)::int AS total FROM admin_operations');
    return { page, pageSize: PAGE_SIZE, total: total.rows[0].total, entries: rows.rows.map(row => ({
      requestId: row.request_id, targetId: row.target_id, kind: row.kind, reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(), result: projectResult(row.result),
    })) };
  }
  async operate(actor: string, kind: AdminOperationKind, body: unknown) {
    if (actor !== ADMIN_ACCOUNT_ID) throw new CharacterError('ADMIN_FORBIDDEN', 403);
    const input = adminOperationInput(kind, body);
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize globally unique receipts, then lock the same owner as draws/saves.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`admin-request:${input.requestId}`]);
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.targetId]);
      // Recheck owner inside the transaction, not only before waiting on locks.
      const owner = await db.query('SELECT email FROM users WHERE id=$1 FOR SHARE', [actor]);
      if (owner.rows.length !== 1 || owner.rows[0].email.toLowerCase() !== ADMIN_ACCOUNT_EMAIL) throw new CharacterError('ADMIN_FORBIDDEN', 403);
      const existing = await db.query('SELECT actor_id, fingerprint, result FROM admin_operations WHERE request_id=$1', [input.requestId]);
      if (existing.rows[0]) {
        if (existing.rows[0].actor_id !== actor || existing.rows[0].fingerprint !== input.fingerprint) throw new CharacterError('REQUEST_ID_CONFLICT', 409);
        await db.query('COMMIT');
        return { requestId: input.requestId, replayed: true, result: projectResult(existing.rows[0].result) };
      }
      const target = await db.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [input.targetId]);
      if (target.rows.length !== 1) throw new CharacterError('ACCOUNT_NOT_FOUND', 404);
      let result: ReturnType<typeof projectResult>;
      if (kind === 'revoke-sessions') {
        const web = await db.query(`WITH revoked AS (
          DELETE FROM user_sessions WHERE sess->>'userId'=$1 RETURNING sid
        ), tombstones AS (
          INSERT INTO admin_revoked_web_sessions(sid) SELECT sid FROM revoked ON CONFLICT(sid) DO NOTHING
        ) SELECT COUNT(*)::int AS count FROM revoked`, [input.targetId]);
        const mobile = await db.query(`UPDATE mobile_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [input.targetId]);
        await db.query(`DELETE FROM mobile_refresh_tokens WHERE session_id IN (SELECT id FROM mobile_sessions WHERE user_id=$1 AND revoked_at IS NOT NULL)`, [input.targetId]);
        result = { webSessions: web.rows[0].count, mobileSessions: mobile.rowCount ?? 0 };
      } else {
        const profiles = await db.query<{ state: CharacterState }>('SELECT state FROM character_profiles WHERE user_id=$1 FOR UPDATE', [input.targetId]);
        const state = profiles.rows[0]?.state || (kind === 'revoke-item' || kind === 'revoke-points' ? null : { ...newCharacter({}, vietnamDate()), pendingEnrollment: true });
        if (!state) throw new CharacterError(kind === 'revoke-item' ? 'ITEM_NOT_OWNED' : 'NOT_ENOUGH_POINTS', 409);
        const next = { ...state };
        if (kind === 'grant-points') {
          const bonus = (state.bonusPoints ?? 0) + input.points;
          if (!Number.isSafeInteger(state.bonusPoints ?? 0) || (state.bonusPoints ?? 0) < 0 || !Number.isSafeInteger(bonus)) throw new CharacterError('INVALID_CHARACTER', 409);
          next.bonusPoints = bonus;
          const values = [WELCOME_POINTS, bonus, state.recycledPoints ?? 0, ...Object.values(state.awards).map(award => award.points)];
          if (values.some(value => !Number.isSafeInteger(value) || value < 0) || !Number.isSafeInteger(values.reduce((sum, value) => sum + value, 0)) || !Number.isSafeInteger(state.spentPoints) || state.spentPoints < 0) throw new CharacterError('INVALID_CHARACTER', 409);
          result = { points: input.points };
        } else if (kind === 'revoke-points') {
          const credits = [WELCOME_POINTS, state.bonusPoints ?? 0, state.recycledPoints ?? 0, ...Object.values(state.awards).map(award => award.points)];
          const revoked = (state.revokedPoints ?? 0) + input.points;
          if ([...credits, state.spentPoints, state.revokedPoints ?? 0, revoked].some(value => !Number.isSafeInteger(value) || value < 0) || !Number.isSafeInteger(credits.reduce((sum, value) => sum + value, 0)) || !Number.isSafeInteger(state.spentPoints + revoked)) throw new CharacterError('INVALID_CHARACTER', 409);
          if (input.points > pointsForState(state).availablePoints) throw new CharacterError('NOT_ENOUGH_POINTS', 409);
          next.revokedPoints = revoked;
          result = { points: input.points };
        } else if (kind === 'revoke-item') {
          const duplicates = state.duplicateItemCounts?.[input.itemId] ?? 0;
          if (!Number.isSafeInteger(duplicates) || duplicates < 0 || duplicates >= Number.MAX_SAFE_INTEGER) throw new CharacterError('INVALID_CHARACTER', 409);
          if (!state.ownedItemIds.includes(input.itemId) || input.copies > duplicates + 1) throw new CharacterError('NOT_ENOUGH_ITEMS', 409);
          const remaining = duplicates + 1 - input.copies;
          next.duplicateItemCounts = { ...state.duplicateItemCounts };
          if (remaining > 1) next.duplicateItemCounts[input.itemId] = remaining - 1;
          else delete next.duplicateItemCounts[input.itemId];
          if (!remaining) {
            next.ownedItemIds = state.ownedItemIds.filter(id => id !== input.itemId);
            next.equipped = { ...state.equipped };
            for (const slot of Object.keys(DEFAULT_EQUIPMENT) as (keyof typeof DEFAULT_EQUIPMENT)[]) {
              if (next.equipped[slot] === input.itemId) {
                next.equipped[slot] = DEFAULT_EQUIPMENT[slot];
                if (!next.ownedItemIds.includes(DEFAULT_EQUIPMENT[slot])) next.ownedItemIds.push(DEFAULT_EQUIPMENT[slot]);
              }
            }
            // Public ranking portraits must not retain a revoked equipped item.
            await db.query('UPDATE character_rankings SET equipment=$2 WHERE user_id=$1', [input.targetId, JSON.stringify(next.equipped)]);
          }
          result = { itemId: input.itemId, copies: input.copies };
        } else {
          const owned = state.ownedItemIds.includes(input.itemId);
          const duplicates = (state.duplicateItemCounts?.[input.itemId] ?? 0) + input.copies - (owned ? 0 : 1);
          if (!Number.isSafeInteger(state.duplicateItemCounts?.[input.itemId] ?? 0) || (state.duplicateItemCounts?.[input.itemId] ?? 0) < 0 || !Number.isSafeInteger(duplicates) || duplicates >= Number.MAX_SAFE_INTEGER) throw new CharacterError('INVALID_CHARACTER', 409);
          next.ownedItemIds = [...new Set([...state.ownedItemIds, input.itemId])];
          next.duplicateItemCounts = { ...state.duplicateItemCounts, [input.itemId]: duplicates };
          result = { itemId: input.itemId, copies: input.copies };
        }
        await db.query(`INSERT INTO character_profiles(user_id,state) VALUES($1,$2)
          ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [input.targetId, JSON.stringify(next)]);
      }
      await db.query(`INSERT INTO admin_operations(request_id,actor_id,target_id,kind,fingerprint,reason,result)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [input.requestId, actor, input.targetId, kind, input.fingerprint, input.reason, JSON.stringify(result)]);
      await db.query('COMMIT');
      return { requestId: input.requestId, replayed: false, result };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
function projectResult(value: Record<string, unknown>): NonNullable<AdminAuditPage['entries'][number]['result']> {
  return { ...(Number.isSafeInteger(value.points) ? { points: Number(value.points) } : {}),
    ...(typeof value.itemId === 'string' && COSMETICS.some(item => item.id === value.itemId) ? { itemId: value.itemId } : {}),
    ...(Number.isSafeInteger(value.copies) ? { copies: Number(value.copies) } : {}),
    ...(Number.isSafeInteger(value.webSessions) ? { webSessions: Number(value.webSessions) } : {}),
    ...(Number.isSafeInteger(value.mobileSessions) ? { mobileSessions: Number(value.mobileSessions) } : {}) };
}
