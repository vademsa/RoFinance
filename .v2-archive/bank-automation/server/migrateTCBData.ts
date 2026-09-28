import { pool } from './db';
import { normalizeTCBUserData } from './tcbDataNormalization';

let updated = 0;
try {
  const users = await pool.query('SELECT user_id, data FROM user_data');
  for (const row of users.rows) {
    const normalized = normalizeTCBUserData(row.data);
    if (JSON.stringify(normalized) === JSON.stringify(row.data)) continue;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [row.user_id]);
      const latest = await db.query('SELECT data FROM user_data WHERE user_id = $1 FOR UPDATE', [row.user_id]);
      const latestData = latest.rows[0]?.data;
      const latestNormalized = normalizeTCBUserData(latestData);
      if (JSON.stringify(latestNormalized) !== JSON.stringify(latestData)) {
        await db.query('UPDATE user_data SET data = $2, updated_at = NOW() WHERE user_id = $1', [
          row.user_id,
          JSON.stringify(latestNormalized),
        ]);
        updated += 1;
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  console.log(`TCB data migration updated ${updated} user record(s)`);
} finally {
  await pool.end();
}
