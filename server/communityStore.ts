import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { COMMUNITY_PAGE_SIZE, validateCommunityDesign, type CommunityDesign, type CommunityPlan } from '../shared/communityPlans';
import { vietnamDate } from '../shared/character';
import type { LocalAppData } from '../src/lib/localDb';
import type { Jar } from '../src/types';
import { createJarPlanSnapshot, getJarConfigurationSignature, switchJarPlan } from '../src/utils/jarPlans';
import { syncBankAccountsWithJars } from '../src/utils/bankAccounts';
import { CharacterError, grantEngagementReward, requireKeys, syncCharacterForSavedFinance, validateRequestId } from './characterStore';
import { validateAndNormalizeUserData } from './dataValidation';

interface PlanRow { id: string; owner_id: string; design: CommunityDesign; active: boolean; adoption_count?: string }
export function publicCommunityPlan(row: PlanRow, viewer: string): CommunityPlan {
  const design = validateCommunityDesign(row.design);
  return { ...design, id: row.id, active: row.active, isOwner: row.owner_id === viewer, adoptionCount: Number(row.adoption_count || 0) };
}
export function prepareCommunityFinance(data: Partial<LocalAppData>, plan: { id: string; design: CommunityDesign }, now = new Date(`${vietnamDate()}T12:00:00`)) {
  const current = data.jars || [], archived = data.archivedJars || [];
  const jars: Jar[] = plan.design.jars.map((layout, i) => {
    const own = current.find(j => j.code === layout.code) || [...archived].reverse().find(j => j.code === layout.code);
    return { ...layout, id: `template-${plan.id}-${i}`, bankCode: own?.bankCode || '', bankName: own?.bankName || '', accountNumber: own?.accountNumber || '', accountName: own?.accountName || '', targetBudget: 0, currentSpent: 0 };
  });
  const target = { id: `community-${plan.id}`, name: plan.design.title, sourcePlanId: 'custom', jars, createdAt: now.toISOString() };
  let snapshots = [...(data.jarPlanSnapshots || [])];
  if (current.length && !snapshots.some(s => getJarConfigurationSignature(s.jars) === getJarConfigurationSignature(current))) {
    snapshots.push({ ...createJarPlanSnapshot(current, data.activeJarPlanId || 'custom', 'Previous configuration', now), id: `backup-${randomUUID()}` });
  }
  snapshots = [...snapshots.filter(s => s.id !== target.id), target];
  const result = switchJarPlan({ currentJars: current, archivedJars: archived, targetSnapshot: target, transactions: data.transactions || [], resetDay: data.preferences?.monthlyResetDay || 1, now });
  return { ...data, jars: result.activeJars, archivedJars: result.archivedJars, activeJarPlanId: `snapshot-${target.id}`, jarPlanSnapshots: snapshots,
    bankAccounts: syncBankAccountsWithJars(result.activeJars, data.bankAccounts || [], data.transactions || []) };
}
export class CommunityStore {
  constructor(private pool: Pool) {}
  async list(owner: string, query: unknown) {
    const q = requireKeys(query, ['page', 'mine']);
    if (q.page !== undefined && (typeof q.page !== 'string' || !/^[1-9]\d{0,4}$/.test(q.page)) || q.mine !== undefined && q.mine !== 'true') throw new CharacterError('INVALID_INPUT');
    const page = Number(q.page || 1), mine = q.mine === 'true';
    const where = mine ? 'p.owner_id = $1' : 'p.active = TRUE';
    const args = mine ? [owner] : [];
    const count = await this.pool.query(`SELECT COUNT(*)::int AS total FROM community_jar_plans p WHERE ${where}`, args);
    const rows = await this.pool.query<PlanRow>(`SELECT p.*, (SELECT COUNT(*) FROM community_plan_adoptions a WHERE a.plan_id=p.id) AS adoption_count FROM community_jar_plans p WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, COMMUNITY_PAGE_SIZE, (page - 1) * COMMUNITY_PAGE_SIZE]);
    return { page, total: count.rows[0].total, plans: rows.rows.map(row => publicCommunityPlan(row, owner)) };
  }
  async publish(owner: string, body: unknown) {
    let design: CommunityDesign;
    try { design = validateCommunityDesign(body); } catch (e) { throw new CharacterError(e instanceof Error ? e.message : 'INVALID_DESIGN'); }
    const hash = createHash('sha256').update(JSON.stringify([...design.jars].sort((a, b) => a.code.localeCompare(b.code)))).digest('hex');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
      const duplicate = await db.query<PlanRow>('SELECT * FROM community_jar_plans WHERE owner_id=$1 AND layout_hash=$2 FOR UPDATE', [owner, hash]);
      let row: PlanRow;
      if (duplicate.rows[0]) {
        // Layout is immutable; identical re-publication retains the same adoption history.
        row = (await db.query<PlanRow>('UPDATE community_jar_plans SET design=$1,active=TRUE WHERE id=$2 RETURNING *', [JSON.stringify(design), duplicate.rows[0].id])).rows[0];
      } else {
        const count = await db.query('SELECT COUNT(*)::int AS count FROM community_jar_plans WHERE owner_id=$1', [owner]);
        if (count.rows[0].count >= 50) throw new CharacterError('PLAN_LIMIT', 409);
        row = (await db.query<PlanRow>('INSERT INTO community_jar_plans (id,owner_id,design,layout_hash) VALUES ($1,$2,$3,$4) RETURNING *', [randomUUID(), owner, JSON.stringify(design), hash])).rows[0];
      }
      await db.query('COMMIT');
      return { plan: publicCommunityPlan(row, owner) };
    } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  }
  async unpublish(owner: string, id: unknown) {
    const planId = validateRequestId(id);
    const result = await this.pool.query('UPDATE community_jar_plans SET active=FALSE WHERE id=$1 AND owner_id=$2 RETURNING id', [planId, owner]);
    if (!result.rowCount) throw new CharacterError('PLAN_NOT_FOUND', 404);
    return { success: true };
  }
  async adopt(owner: string, body: unknown) {
    const input = requireKeys(body, ['planId', 'requestId', 'expectedRevision'], ['planId', 'requestId', 'expectedRevision']);
    const planId = validateRequestId(input.planId), requestId = validateRequestId(input.requestId);
    if (typeof input.expectedRevision !== 'string' || !/^\d{1,20}$/.test(input.expectedRevision)) throw new CharacterError('INVALID_REVISION');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query<PlanRow>('SELECT * FROM community_jar_plans WHERE id=$1', [planId]);
      if (!found.rows[0]) throw new CharacterError('PLAN_NOT_FOUND', 404);
      const author = found.rows[0].owner_id;
      // Sort actual lock keys, including hash collisions, to prevent reciprocal-adoption deadlocks.
      const locks = await db.query('SELECT DISTINCT hashtext(v)::bigint AS key FROM unnest($1::text[]) v ORDER BY key', [[owner, author]]);
      for (const lock of locks.rows) await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [lock.key]);
      const finance = await db.query<{ data: Partial<LocalAppData>; revision: string }>('SELECT data,revision FROM user_data WHERE user_id=$1 FOR UPDATE', [owner]);
      const receipt = await db.query('SELECT plan_id,rewarded FROM community_plan_actions WHERE user_id=$1 AND request_id=$2', [owner, requestId]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].plan_id !== planId) throw new CharacterError('REQUEST_ID_CONFLICT', 409);
        await db.query('COMMIT');
        return { revision: finance.rows[0]?.revision || '0', creatorRewardGranted: receipt.rows[0].rewarded };
      }
      const row = (await db.query<PlanRow>('SELECT * FROM community_jar_plans WHERE id=$1 FOR UPDATE', [planId])).rows[0];
      if (!row.active) throw new CharacterError('PLAN_NOT_FOUND', 404);
      const revision = finance.rows[0]?.revision || '0';
      if (revision !== input.expectedRevision) throw new CharacterError('STALE_FINANCE', 409);
      const data = finance.rows[0]?.data || {};
      const next = prepareCommunityFinance(data, { id: planId, design: validateCommunityDesign(row.design) });
      const validation = validateAndNormalizeUserData(next, data as Record<string, unknown>);
      if (!validation.value) throw new CharacterError('PLAN_FINANCE_CONFLICT', 409);
      const saved = await db.query<{ revision: string }>(`INSERT INTO user_data (user_id,data,revision) VALUES ($1,$2,1) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data,revision=user_data.revision+1,updated_at=NOW() RETURNING revision`, [owner, JSON.stringify(validation.value)]);
      await syncCharacterForSavedFinance(db, owner, validation.value);
      let rewarded = false;
      if (owner !== author) {
        const adoption = await db.query('INSERT INTO community_plan_adoptions (plan_id,adopter_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING plan_id', [planId, owner]);
        if (adoption.rowCount) rewarded = await grantEngagementReward(db, author, 'adoption', `${planId}:${owner}`);
      }
      await db.query('INSERT INTO community_plan_actions (user_id,request_id,plan_id,rewarded) VALUES ($1,$2,$3,$4)', [owner, requestId, planId, rewarded]);
      await db.query('COMMIT');
      return { revision: saved.rows[0].revision, creatorRewardGranted: rewarded };
    } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  }
}
