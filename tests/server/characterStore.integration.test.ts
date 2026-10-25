import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { CHARACTER_SCHEMA_SQL } from '../../server/characterSchema';
import { CharacterStore, drawCharacter, newCharacter, syncCharacterForSavedFinance } from '../../server/characterStore';
import { grantCharacterTestPoints } from '../helpers/characterTestGrant';
import { COSMETICS } from '../../shared/character';
import type { MonthlyCycleSummary } from '../../src/types';

test('isolated PostgreSQL: concurrent/retried draws, ownership, rollback, corrections and private leaderboard',
  { skip: !process.env.CHARACTER_TEST_DATABASE_URL }, async () => {
    const schema = `rf_character_test_${randomBytes(8).toString('hex')}`;
    const config = { connectionString: process.env.CHARACTER_TEST_DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } };
    const admin = new pg.Pool(config);
    let dbPool: pg.Pool | null = null;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      dbPool = new pg.Pool({ ...config, options: `-c search_path=${schema}` });
      await dbPool.query('CREATE TABLE users (id UUID PRIMARY KEY, email TEXT); CREATE TABLE user_data (user_id UUID PRIMARY KEY REFERENCES users(id), data JSONB NOT NULL)');
      await dbPool.query(CHARACTER_SCHEMA_SQL);
      // Startup migrations must be repeatable.
      await dbPool.query(CHARACTER_SCHEMA_SQL);
      const owner = randomUUID(); const other = randomUUID();
      await dbPool.query('INSERT INTO users (id,email) VALUES ($1,$3),($2,$4)', [owner, other, 'test@example.com', 'other@example.com']);
      // Emulate an existing ranking table and verify the additive migration
      // preserves its portrait and score while enforcing the new enum.
      await dbPool.query('ALTER TABLE character_rankings DROP COLUMN gender');
      const legacyEquipment = newCharacter({}, '2025-01-01').equipped;
      await dbPool.query('INSERT INTO character_rankings(user_id,season,nickname,character_id,equipment,score) VALUES($1,$2,$3,$4,$5,$6)', [owner, '2025-01', 'Legacy alias', 'sun', JSON.stringify(legacyEquipment), 95]);
      await dbPool.query(CHARACTER_SCHEMA_SQL); await dbPool.query(CHARACTER_SCHEMA_SQL);
      const migrated = (await dbPool.query('SELECT nickname,equipment,score,gender FROM character_rankings WHERE user_id=$1', [owner])).rows[0];
      assert.deepEqual(migrated, { nickname: 'Legacy alias', equipment: legacyEquipment, score: 95, gender: 'male' });
      await assert.rejects(() => dbPool!.query("UPDATE character_rankings SET gender='forged' WHERE user_id=$1", [owner]));
      let day = '2026-10-07';
      const store = new CharacterStore(dbPool, () => day);
      const initial = await store.profile(owner);
      assert.equal(initial.availablePoints, 40);
      await store.update(owner, { gender: 'female' });
      assert.equal((await store.profile(owner)).gender, 'female');
      assert.equal((await store.profile(other)).gender, 'male');
      await assert.rejects(() => store.update(owner, { gender: 'forged' }), /INVALID_GENDER/);
      const requestId = randomUUID();
      const [first, retry] = await Promise.all([store.action(owner, 'draw', { requestId }), store.action(owner, 'draw', { requestId })]);
      assert.deepEqual(first.result, retry.result);
      assert.equal((await store.profile(owner)).spentPoints, 20);
      assert.equal((await store.profile(other)).spentPoints, 0);
      await assert.rejects(() => store.action(owner, 'exchange', { requestId, itemId: 'hat-gold' }), /REQUEST_ID_CONFLICT/);
      const afterDraw = await store.profile(owner);
      const unowned = COSMETICS.find((item) => !afterDraw.ownedItemIds.includes(item.id))!;
      await assert.rejects(() => store.update(owner, { equipped: { ...initial.equipped, [unowned.slot]: unowned.id } }), /UNOWNED_EQUIPMENT/);
      assert.throws(() => store.action(owner, 'exchange', { requestId, itemId: ['hat-gold'] }), /INVALID_ITEM/);
      // Secret draw-only items cannot bypass the allowlist, even with a UUID
      // already committed for another action.
      for (const item of COSMETICS.filter((item) => item.rarity === 'legendary')) {
        assert.throws(() => store.action(owner, 'exchange', { requestId, itemId: item.id }), /INVALID_ITEM/);
      }
      await store.action(owner, 'draw', { requestId: randomUUID() });
      await assert.rejects(() => store.action(owner, 'draw', { requestId: randomUUID() }), /NOT_ENOUGH_POINTS/);
      assert.equal((await store.profile(owner)).drawCount, 2);

      // Separate fresh requests cannot both spend the last available draw.
      // A disabled client button is never the backend authorization boundary.
      await store.action(other, 'draw', { requestId: randomUUID() });
      const finalRequestIds = [randomUUID(), randomUUID()];
      const lastDraws = await Promise.allSettled(finalRequestIds.map((requestId) => store.action(other, 'draw', { requestId })));
      assert.equal(lastDraws.filter((entry) => entry.status === 'fulfilled').length, 1);
      const rejected = lastDraws.find((entry) => entry.status === 'rejected');
      assert.ok(rejected?.status === 'rejected' && rejected.reason.code === 'NOT_ENOUGH_POINTS' && rejected.reason.status === 409);
      const exhausted = await store.profile(other);
      assert.equal(exhausted.availablePoints, 0);
      assert.equal(exhausted.spentPoints, 40);
      assert.equal(exhausted.drawCount, 2);
      const committedIndex = lastDraws.findIndex((entry) => entry.status === 'fulfilled');
      const committed = lastDraws[committedIndex];
      assert.ok(committed.status === 'fulfilled');
      assert.deepEqual((await store.action(other, 'draw', { requestId: finalRequestIds[committedIndex] })).result, committed.value.result);
      assert.equal((await store.profile(other)).spentPoints, 40);
      assert.throws(() => store.action(other, 'draw', { requestId: randomUUID(), availablePoints: 100000 }), /INVALID_INPUT/);

      // Existing guaranteed:true receipts are historical facts, not permission
      // for future guaranteed draws. Replay must still work at zero points.
      const legacyOwner = randomUUID(); const legacyReceipt = randomUUID();
      const legacyState = { ...newCharacter({}, day), spentPoints: 40, drawCount: 2, pityCount: 9 };
      legacyState.ownedItemIds.push('shirt-rose');
      const legacyResult = { itemId: 'shirt-rose', duplicate: false, fragments: 0, guaranteed: true };
      await dbPool.query('INSERT INTO users(id,email) VALUES($1,$2)', [legacyOwner, 'legacy-insurance@example.com']);
      await dbPool.query('INSERT INTO character_profiles(user_id,state) VALUES($1,$2)', [legacyOwner, JSON.stringify(legacyState)]);
      await dbPool.query('INSERT INTO character_actions(user_id,request_id,fingerprint,result) VALUES($1,$2,$3,$4)', [legacyOwner, legacyReceipt, 'draw:', JSON.stringify(legacyResult)]);
      const legacyStore = new CharacterStore(dbPool, () => day, (state) => drawCharacter(state, 0, 0));
      const legacyReplay = await legacyStore.action(legacyOwner, 'draw', { requestId: legacyReceipt });
      assert.deepEqual(legacyReplay.result, legacyResult);
      assert.equal(legacyReplay.profile.availablePoints, 0);
      assert.equal(legacyReplay.profile.spentPoints, 40);
      assert.equal(legacyReplay.profile.pityCount, 9);
      await dbPool.query('UPDATE character_profiles SET state=$2 WHERE user_id=$1', [legacyOwner, JSON.stringify({ ...legacyState, bonusPoints: 20 })]);
      const independentDraw = await legacyStore.action(legacyOwner, 'draw', { requestId: randomUUID() });
      assert.deepEqual(independentDraw.result, { itemId: null, duplicate: false, fragments: 0, guaranteed: false });
      assert.equal(independentDraw.profile.pityCount, 0);
      assert.equal(independentDraw.profile.spentPoints, 60);
      assert.deepEqual(independentDraw.profile.ownedItemIds, legacyState.ownedItemIds);
      assert.deepEqual((await legacyStore.action(legacyOwner, 'draw', { requestId: legacyReceipt })).result, legacyResult);
      assert.equal((await legacyStore.profile(legacyOwner)).spentPoints, 60);

      const summary: MonthlyCycleSummary = { id: 'cycle', cycleStart: '2026-10-01', cycleEnd: '2026-10-31',
        income: 1000, expense: 500, transactionCount: 1, createdAt: '2026-11-01T00:00:00Z',
        spendingByJar: [{ jarId: 'nec', amount: 500 }], jarBreakdown: [{ jarId: 'nec', jarCode: 'NEC', jarName: 'Private jar',
          openingCarryover: 0, cycleAllocation: 1000, availableBudget: 1000, spent: 500, remaining: 500, closingCarryovers: [] }] };
      const finance = { monthlyIncome: 1000, monthlySummaries: [summary], transactions: [] };
      await dbPool.query('INSERT INTO user_data(user_id,data) VALUES($1,$2)', [owner, JSON.stringify(finance)]);
      day = '2026-11-01';
      const earned = await store.profile(owner);
      assert.equal(earned.availablePoints, 20);
      assert.equal((await store.leaderboard('2026-10')).entries.length, 0);
      await store.update(owner, { nickname: 'Public alias', optIn: true });
      const board = await store.leaderboard('2026-10');
      assert.equal(board.entries.length, 1);
      assert.equal(board.entries[0].score, 100);
      assert.equal(board.entries[0].gender, 'female');
      assert.deepEqual(Object.keys(board.entries[0]).sort(), ['rank', 'nickname', 'characterId', 'gender', 'equipped', 'score'].sort());
      assert.ok(!JSON.stringify(board).includes('Private jar'));
      assert.ok(!JSON.stringify(board).includes(owner));
      await dbPool.query('INSERT INTO user_data(user_id,data) VALUES($1,$2)', [other, JSON.stringify(finance)]);
      await store.profile(other);
      await store.update(other, { nickname: 'Second alias', optIn: true });
      const tied = await store.leaderboard('2026-10');
      assert.equal(tied.entries.length, 2);
      assert.ok(tied.entries.every((entry) => entry.rank === 1));
      await store.update(other, { optIn: false });
      assert.equal((await store.leaderboard('2026-10')).entries.length, 1);
      await store.action(owner, 'draw', { requestId: randomUUID() });
      // Finance save and companion correction share the same transaction/owner lock.
      const db = await dbPool.connect();
      try {
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
        const corrected = { ...finance, monthlySummaries: [] };
        await db.query('UPDATE user_data SET data=$2 WHERE user_id=$1', [owner, JSON.stringify(corrected)]);
        await syncCharacterForSavedFinance(db, owner, corrected, day);
        await db.query('COMMIT');
      } finally { db.release(); }
      const corrected = await store.profile(owner);
      assert.equal(corrected.pointsShortfall, 20);
      assert.equal(corrected.drawCount, 3);
      assert.equal((await store.leaderboard('2026-10')).entries.length, 0);
      await store.update(owner, { optIn: false });
      assert.equal((await store.leaderboard('2026-10')).entries.length, 0);
      const beforeBonus = await store.profile(owner);
      const beforeOther = await store.profile(other);
      const financeBefore = (await dbPool.query('SELECT * FROM user_data ORDER BY user_id')).rows;
      const rankingsBefore = (await dbPool.query('SELECT * FROM character_rankings ORDER BY user_id,season')).rows;
      const bonusId = randomUUID();
      const bonuses = await Promise.all([
        grantCharacterTestPoints(dbPool, 'TEST@example.com', 1000, bonusId),
        grantCharacterTestPoints(dbPool, 'test@example.com', 1000, bonusId),
      ]);
      assert.equal(bonuses.filter((result) => result.granted).length, 1);
      const afterBonus = await store.profile(owner);
      assert.equal(afterBonus.bonusPoints, 1000);
      assert.equal(afterBonus.availablePoints, 980); // Test credit also covers the existing 20-point correction deficit.
      assert.deepEqual({ ...afterBonus, bonusPoints: undefined, availablePoints: beforeBonus.availablePoints,
        pointsShortfall: beforeBonus.pointsShortfall }, { ...beforeBonus, bonusPoints: undefined });
      assert.deepEqual(await store.profile(other), beforeOther);
      assert.deepEqual((await dbPool.query('SELECT * FROM user_data ORDER BY user_id')).rows, financeBefore);
      const emptyOwner = randomUUID();
      await dbPool.query('INSERT INTO users (id,email) VALUES ($1,$2)', [emptyOwner, 'empty-result@example.com']);
      const emptyStore = new CharacterStore(dbPool, () => day, (state) => drawCharacter(state, 0, 0));
      const beforeEmpty = await emptyStore.profile(emptyOwner);
      const emptyRequest = randomUUID();
      const [empty, emptyRetry] = await Promise.all([
        emptyStore.action(emptyOwner, 'draw', { requestId: emptyRequest }),
        emptyStore.action(emptyOwner, 'draw', { requestId: emptyRequest }),
      ]);
      assert.deepEqual(empty.result, { itemId: null, duplicate: false, fragments: 0, guaranteed: false });
      assert.deepEqual(emptyRetry.result, empty.result);
      const afterEmpty = await emptyStore.profile(emptyOwner);
      assert.equal(afterEmpty.spentPoints, 20);
      assert.equal(afterEmpty.drawCount, 1);
      assert.equal(afterEmpty.pityCount, 0);
      assert.deepEqual(afterEmpty.ownedItemIds, beforeEmpty.ownedItemIds);
      assert.deepEqual(afterEmpty.equipped, beforeEmpty.equipped);
      assert.equal(afterEmpty.fragments, beforeEmpty.fragments);
      assert.deepEqual((await new CharacterStore(dbPool, () => day).action(emptyOwner, 'draw', { requestId: emptyRequest })).result, empty.result);
      assert.equal((await emptyStore.profile(emptyOwner)).spentPoints, 20);
      assert.deepEqual((await dbPool.query('SELECT * FROM character_rankings ORDER BY user_id,season')).rows, rankingsBefore);
      assert.equal((await dbPool.query('SELECT * FROM character_point_grants')).rows.length, 1);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'test@example.com', 20, bonusId), /REQUEST_ID_CONFLICT/);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'other@example.com', 1000, bonusId), /REQUEST_ID_CONFLICT/);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'missing@example.com', 1000, randomUUID()), /TEST_ACCOUNT_NOT_FOUND/);
      for (const points of [0, -1, 0.5, 100001, NaN]) {
        await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'test@example.com', points, randomUUID()), /INVALID_TEST_GRANT/);
      }
      const noCharacter = randomUUID();
      await dbPool.query('INSERT INTO users (id,email) VALUES ($1,$2)', [noCharacter, 'no-character@example.com']);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'no-character@example.com', 1000, randomUUID()), /CHARACTER_NOT_FOUND/);
      await store.action(owner, 'draw', { requestId: randomUUID() });
      const bonusDraw = await store.profile(owner);
      assert.equal(bonusDraw.bonusPoints, 1000);
      assert.equal(bonusDraw.availablePoints, 960);
      assert.equal(bonusDraw.lifetimeScore, beforeBonus.lifetimeScore);
      assert.deepEqual((await dbPool.query('SELECT * FROM user_data ORDER BY user_id')).rows, financeBefore);
      const collectionId = randomUUID();
      const beforeCollection = await store.profile(owner);
      const collection = await Promise.all([
        grantCharacterTestPoints(dbPool, 'test@example.com', 19980, collectionId, true),
        grantCharacterTestPoints(dbPool, 'TEST@example.com', 19980, collectionId, true),
      ]);
      assert.equal(collection.filter((entry) => entry.granted).length, 1);
      const afterCollection = await store.profile(owner);
      assert.equal(afterCollection.availablePoints - beforeCollection.availablePoints, 19980);
      assert.equal(afterCollection.ownedItemIds.length, COSMETICS.length);
      assert.ok(COSMETICS.every((item) => afterCollection.ownedItemIds.includes(item.id)));
      assert.deepEqual({ ...afterCollection, bonusPoints: beforeCollection.bonusPoints, availablePoints: beforeCollection.availablePoints, ownedItemIds: beforeCollection.ownedItemIds }, beforeCollection);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'test@example.com', 19980, collectionId, false), /REQUEST_ID_CONFLICT/);
      await assert.rejects(() => grantCharacterTestPoints(dbPool!, 'other@example.com', 19980, collectionId, true), /REQUEST_ID_CONFLICT/);
      assert.deepEqual(await store.profile(other), beforeOther);
      assert.deepEqual((await dbPool.query('SELECT * FROM user_data ORDER BY user_id')).rows, financeBefore);
      assert.deepEqual((await dbPool.query('SELECT * FROM character_rankings ORDER BY user_id,season')).rows, rankingsBefore);
    } finally {
      if (dbPool) await dbPool.end();
      // Exact generated test schema; never targets the application schema.
      if (/^rf_character_test_[0-9a-f]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
