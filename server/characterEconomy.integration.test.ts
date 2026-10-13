import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { CHARACTER_SCHEMA_SQL } from './characterSchema';
import { CharacterStore, drawCharacter, newCharacter, syncCharacterForSavedFinance } from './characterStore';
import { COSMETICS } from '../shared/character';

test('isolated PostgreSQL: duplicate economy is atomic, idempotent, owner-scoped and cannot overwrite finance or rankings',
  { skip: !process.env.CHARACTER_TEST_DATABASE_URL }, async () => {
    const schema = `rf_character_economy_${randomBytes(8).toString('hex')}`;
    const config = { connectionString: process.env.CHARACTER_TEST_DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } };
    const admin = new pg.Pool(config); let pool: pg.Pool | null = null;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new pg.Pool({ ...config, options: `-c search_path=${schema}` });
      await pool.query('CREATE TABLE users(id UUID PRIMARY KEY); CREATE TABLE user_data(user_id UUID PRIMARY KEY REFERENCES users(id),data JSONB NOT NULL)');
      await pool.query(CHARACTER_SCHEMA_SQL);
      const owner = randomUUID(), other = randomUUID();
      await pool.query('INSERT INTO users(id) VALUES($1),($2)', [owner, other]);
      const finance = { monthlyIncome: 1000, monthlySummaries: [], transactions: [] };
      await pool.query('INSERT INTO user_data(user_id,data) VALUES($1,$3),($2,$3)', [owner, other, JSON.stringify(finance)]);
      const state = { ...newCharacter(finance, '2026-10-09'), spentPoints: 40, fragments: 37,
        ownedItemIds: [...newCharacter({}, '2026-10-09').ownedItemIds, 'shirt-mint', 'hat-mint', 'hat-gold'],
        duplicateItemCounts: { 'shirt-mint': 7, 'hat-mint': 7, 'hat-gold': 7 } };
      const save = async () => pool!.query('INSERT INTO character_profiles(user_id,state) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state', [owner, JSON.stringify(state)]);
      await save();
      const store = new CharacterStore(pool, () => '2026-10-09', (profile) => drawCharacter(profile, 0));
      const beforeOther = await store.profile(other);
      const beforeFinance = (await pool.query('SELECT * FROM user_data ORDER BY user_id')).rows;
      const beforeRankings = (await pool.query('SELECT * FROM character_rankings')).rows;
      const items = [{ itemId: 'shirt-mint', count: 1 }, { itemId: 'hat-mint', count: 1 }];
      const recycleId = randomUUID();
      const [first, replay] = await Promise.all([store.action(owner, 'recycle', { requestId: recycleId, items }), store.action(owner, 'recycle', { requestId: recycleId, items: [...items].reverse() })]);
      assert.deepEqual(first.result, replay.result);
      assert.equal(replay.profile.recycledPoints, 20);
      assert.equal(replay.profile.duplicateItemCounts?.['shirt-mint'], 6);
      assert.equal(replay.profile.fragments, 37);
      assert.deepEqual(replay.profile.equipped, state.equipped);
      assert.deepEqual(replay.profile.ownedItemIds, state.ownedItemIds);
      await assert.rejects(() => store.action(owner, 'recycle', { requestId: recycleId, items: [{ itemId: 'shirt-mint', count: 2 }] }), /REQUEST_ID_CONFLICT/);
      await assert.rejects(() => store.action(owner, 'fuse', { requestId: recycleId, items: [{ itemId: 'hat-gold', count: 7 }] }), /REQUEST_ID_CONFLICT/);
      await assert.rejects(() => store.action(other, 'recycle', { requestId: recycleId, items }), /NOT_ENOUGH_DUPLICATES/);
      assert.deepEqual(await store.profile(other), beforeOther);
      await save();
      const fuseItems = [{ itemId: 'shirt-mint', count: 7 }];
      const fusionRace = await Promise.allSettled([store.action(owner, 'fuse', { requestId: randomUUID(), items: fuseItems }), store.action(owner, 'fuse', { requestId: randomUUID(), items: fuseItems })]);
      assert.equal(fusionRace.filter((entry) => entry.status === 'fulfilled').length, 1);
      const fusionWin = fusionRace.find((entry) => entry.status === 'fulfilled'); assert(fusionWin?.status === 'fulfilled');
      assert(COSMETICS.some((item) => item.id === fusionWin.value.result.itemId && item.rarity === 'rare'));
      const fusionFail = fusionRace.find((entry) => entry.status === 'rejected'); assert(fusionFail?.status === 'rejected');
      assert.equal(fusionFail.reason.code, 'NOT_ENOUGH_DUPLICATES');
      const savedReceipt = (await pool.query("SELECT request_id,result FROM character_actions WHERE user_id=$1 AND fingerprint LIKE 'fuse:%' ORDER BY created_at DESC LIMIT 1", [owner])).rows[0];
      const fusionReplay = await store.action(owner, 'fuse', { requestId: savedReceipt.request_id, items: fuseItems });
      assert.deepEqual(fusionReplay.result, savedReceipt.result);
      assert.equal(fusionReplay.profile.duplicateItemCounts?.['shirt-mint'], undefined);
      assert.equal(fusionReplay.profile.recycledPoints, undefined);
      assert.equal(fusionReplay.profile.availablePoints, 0);
      await save();
      // Recycling and fusion compete for the SAME seven spare copies.
      const competing = await Promise.allSettled([store.action(owner, 'fuse', { requestId: randomUUID(), items: fuseItems }), store.action(owner, 'recycle', { requestId: randomUUID(), items: [{ itemId: 'shirt-mint', count: 2 }] })]);
      assert.equal(competing.filter((entry) => entry.status === 'fulfilled').length, 1);
      await save();
      state.duplicateItemCounts['shirt-mint'] = 2; await save();
      const creditRace = await Promise.allSettled([0, 1].map(() => store.action(owner, 'recycle', { requestId: randomUUID(), items: [{ itemId: 'shirt-mint', count: 2 }] })));
      assert.equal(creditRace.filter((entry) => entry.status === 'fulfilled').length, 1);
      const drawn = await Promise.allSettled([0, 1].map(() => store.action(owner, 'draw', { requestId: randomUUID() })));
      assert.equal(drawn.filter((entry) => entry.status === 'fulfilled').length, 1);
      assert.equal((await store.profile(owner)).availablePoints, 0);
      assert.equal((await store.profile(owner)).spentPoints, 60);
      const beforeRejected = await store.profile(owner);
      const receiptCount = (await pool.query('SELECT COUNT(*) FROM character_actions WHERE user_id=$1', [owner])).rows[0].count;
      for (const kind of ['draw', 'recycle', 'fuse'] as const) {
        const input = kind === 'draw' ? { requestId: randomUUID() } : { requestId: randomUUID(), items: kind === 'fuse' ? fuseItems : items };
        for (const key of ['itemId', 'ownerId', 'userId', 'points', 'rarity', 'roll', 'itemIndex', 'result']) assert.throws(() => store.action(owner, kind, { ...input, [key]: 'forged' }), /INVALID_INPUT/);
      }
      for (const patch of [{ duplicateItemCounts: { 'hat-gold': 777 } }, { recycledPoints: 999 }, { ownedItemIds: ['hat-comet'] }]) await assert.rejects(() => store.update(owner, patch), /INVALID_INPUT/);
      assert.deepEqual(await store.profile(owner), beforeRejected);
      assert.equal((await pool.query('SELECT COUNT(*) FROM character_actions WHERE user_id=$1', [owner])).rows[0].count, receiptCount);
      // Finance reconciliation takes the same lock and must retain the economy ledger.
      const db = await pool.connect();
      try {
        await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
        await syncCharacterForSavedFinance(db, owner, finance, '2026-10-09'); await db.query('COMMIT');
      } finally { db.release(); }
      assert.deepEqual(await store.profile(owner), beforeRejected);
      assert.deepEqual((await pool.query('SELECT * FROM user_data ORDER BY user_id')).rows, beforeFinance);
      assert.deepEqual((await pool.query('SELECT * FROM character_rankings')).rows, beforeRankings);
      assert.deepEqual(await store.profile(other), beforeOther);
    } finally {
      if (pool) await pool.end();
      if (/^rf_character_economy_[0-9a-f]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
