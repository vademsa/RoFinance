import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { CHARACTER_SCHEMA_SQL } from '../../server/characterSchema';
import { CommunityStore } from '../../server/communityStore';
import { CharacterStore, syncCharacterForSavedFinance } from '../../server/characterStore';
import { DEFAULT_APP_PREFERENCES } from '../../src/lib/preferences';
import { vietnamDate } from '../../shared/character';

test('isolated PostgreSQL: daily rewards, public templates, atomic adoption, retries and ownership', { skip: !process.env.CHARACTER_TEST_DATABASE_URL }, async () => {
  const schema = `rf_character_community_${randomBytes(8).toString('hex')}`;
  const config = { connectionString: process.env.CHARACTER_TEST_DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } };
  const admin = new pg.Pool(config); let pool: pg.Pool | null = null;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ ...config, options: `-c search_path=${schema}`, max: 10 });
    await pool.query('CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE user_data(user_id UUID PRIMARY KEY REFERENCES users(id),data JSONB NOT NULL,revision BIGINT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(CHARACTER_SCHEMA_SQL); await pool.query(CHARACTER_SCHEMA_SQL);
    const [author, adopter, other] = [randomUUID(), randomUUID(), randomUUID()];
    await pool.query('INSERT INTO users(id) SELECT unnest($1::uuid[])', [[author, adopter, other]]);
    const today = vietnamDate();
    const finance = { monthlyIncome: 10000, activeJarPlanId: 'custom', jarPlanSnapshots: [], jars: [
      { id: 'jar-own', code: 'NEC', name: 'Private jar', percentage: 100, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: '123456789', accountName: 'PRIVATE', color: '#6366f1', description: '', targetBudget: 10000, currentSpent: 0, cycleAllocation: 10000 },
    ], archivedJars: [], transactions: [], bankAccounts: [], preferences: DEFAULT_APP_PREFERENCES };
    for (const owner of [author, adopter, other]) await pool.query('INSERT INTO user_data(user_id,data,revision) VALUES($1,$2,1)', [owner, JSON.stringify(finance)]);
    const store = new CommunityStore(pool), characters = new CharacterStore(pool);
    const draft = { title: 'Plan', description: '', publicAlias: 'Public author', jars: [{ code: 'NEC', name: 'Essentials', percentage: 60, color: '#6366f1', description: '' }, { code: 'FUN', name: 'Fun', percentage: 40, color: '#10b981', description: '' }] };
    const plan = (await store.publish(author, draft)).plan;
    assert.equal((await store.publish(author, draft)).plan.id, plan.id);
    await assert.rejects(store.publish(author, { ...draft, ownerId: adopter }), /INVALID_DESIGN/);
    assert.ok(!JSON.stringify(await store.list(adopter, {})).includes(author));
    assert.ok(!JSON.stringify(await store.list(adopter, {})).includes('123456789'));
    await assert.rejects(store.unpublish(adopter, plan.id), /PLAN_NOT_FOUND/);
    await assert.rejects(store.adopt(adopter, { planId: plan.id, requestId: randomUUID(), expectedRevision: '0' }), /STALE_FINANCE/);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM engagement_reward_claims')).rows[0].n, 0);
    const request = { planId: plan.id, requestId: randomUUID(), expectedRevision: '1' };
    const results = await Promise.all([store.adopt(adopter, request), store.adopt(adopter, request)]);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].creatorRewardGranted, true);
    assert.equal(results[0].revision, '2');
    const profileState = (await pool.query('SELECT state FROM character_profiles WHERE user_id=$1', [author])).rows[0].state;
    assert.equal(profileState.bonusPoints, 20); assert.equal(profileState.pendingEnrollment, true);
    assert.equal(profileState.optIn, false); assert.deepEqual(profileState.awards, {});
    const after = (await pool.query('SELECT data FROM user_data WHERE user_id=$1', [adopter])).rows[0].data;
    assert.equal(after.jars.reduce((s: number, j: { targetBudget: number }) => s + j.targetBudget, 0), 10000);
    assert.equal(after.jars[0].accountNumber, '123456789'); assert.equal(after.jars[1].accountNumber, '');
    assert.deepEqual(after.jarPlanSnapshots[0].jars, finance.jars);
    assert.equal((await store.adopt(adopter, { ...request, requestId: randomUUID(), expectedRevision: '2' })).creatorRewardGranted, false);
    assert.equal((await store.adopt(author, { ...request, requestId: randomUUID(), expectedRevision: '1' })).creatorRewardGranted, false);
    assert.equal((await store.adopt(other, { ...request, requestId: randomUUID(), expectedRevision: '1' })).creatorRewardGranted, true);
    const second = (await store.publish(author, { ...draft, title: 'Different plan', jars: draft.jars.map(j => ({ ...j, percentage: j.code === 'NEC' ? 50 : 50 })) })).plan;
    assert.equal((await store.adopt(adopter, { planId: second.id, requestId: randomUUID(), expectedRevision: '3' })).creatorRewardGranted, true);
    assert.equal((await characters.profile(author)).bonusPoints, 60);
    await store.unpublish(author, plan.id);
    await assert.rejects(store.adopt(other, { ...request, requestId: randomUUID(), expectedRevision: '2' }), /PLAN_NOT_FOUND/);
    assert.equal((await store.publish(author, draft)).plan.id, plan.id);
    assert.equal((await store.adopt(other, { ...request, requestId: randomUUID(), expectedRevision: '2' })).creatorRewardGranted, false);
    await assert.rejects(store.adopt(adopter, { ...request, creatorId: author }), /INVALID_INPUT/);
    // Force a credit failure: the successful-looking adopter finance write must roll back too.
    const brokenAuthor = randomUUID(), freshAdopter = randomUUID();
    await pool.query('INSERT INTO users(id) SELECT unnest($1::uuid[])', [[brokenAuthor, freshAdopter]]);
    await pool.query('INSERT INTO user_data(user_id,data,revision) VALUES($1,$2,1)', [freshAdopter, JSON.stringify(finance)]);
    const brokenPlan = (await store.publish(brokenAuthor, draft)).plan;
    const brokenState = { ...(await characters.profile(brokenAuthor)), bonusPoints: Number.MAX_SAFE_INTEGER };
    await pool.query('UPDATE character_profiles SET state=$2 WHERE user_id=$1', [brokenAuthor, JSON.stringify(brokenState)]);
    await assert.rejects(store.adopt(freshAdopter, { planId: brokenPlan.id, requestId: randomUUID(), expectedRevision: '1' }), /POINT_LIMIT/);
    assert.equal((await pool.query('SELECT revision FROM user_data WHERE user_id=$1', [freshAdopter])).rows[0].revision, '1');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM community_plan_adoptions WHERE plan_id=$1', [brokenPlan.id])).rows[0].n, 0);
    await assert.rejects(store.adopt(adopter, { ...request, planId: second.id, expectedRevision: '4' }), /REQUEST_ID_CONFLICT/);
    // Reciprocal creator/adopter operations: deterministic locks must not deadlock.
    const otherPlan = (await store.publish(other, { ...draft, publicAlias: 'Other author' })).plan;
    await Promise.all([store.adopt(author, { planId: otherPlan.id, requestId: randomUUID(), expectedRevision: '2' }), store.adopt(other, { planId: second.id, requestId: randomUUID(), expectedRevision: '3' })]);
    const tx = { id: 'today-expense', type: 'expense' as const, jarId: 'jar-own', amount: 1, date: today, description: '', category: 'Food' };
    async function daily(owner: string, rollback = false) {
      const db = await pool!.connect();
      try { await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
        const granted = await syncCharacterForSavedFinance(db, owner, { transactions: [tx] }, today, {});
        await db.query(rollback ? 'ROLLBACK' : 'COMMIT'); return granted;
      } finally { db.release(); }
    }
    assert.equal(await daily(author, true), true);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM engagement_reward_claims WHERE kind='daily'")).rows[0].n, 0);
    assert.deepEqual((await Promise.all([daily(author), daily(author), daily(author)])).sort(), [false, false, true]);
    assert.equal((await characters.profile(author)).bonusPoints, 100); // 60 + reciprocal adoption20 + daily20
    assert.equal((await characters.profile(author)).lifetimeScore, 0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM engagement_reward_claims WHERE kind='daily'")).rows[0].n, 1);
  } finally {
    if (pool) await pool.end();
    if (!/^rf_character_community_[0-9a-f]{16}$/.test(schema)) throw new Error('Unsafe test schema');
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
