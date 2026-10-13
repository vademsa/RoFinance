import dotenv from 'dotenv';
import pg from 'pg';
import { grantCharacterTestSpares } from '../server/characterTestGrant';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const [email, rawCopies, requestId, mode, ...extra] = process.argv.slice(2);
if (!email || !rawCopies || !requestId || extra.length || (mode !== undefined && mode !== '--dry-run') || !/^\d+$/.test(rawCopies) || !process.env.DATABASE_URL) {
  throw new Error('Usage: npx tsx scripts/grant-character-test-spares.ts <email> <copies-per-item> <UUID-v4> [--dry-run]; DATABASE_URL must be configured.');
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, max: 1 });
try {
  console.log(JSON.stringify(await grantCharacterTestSpares(pool, email, Number(rawCopies), requestId, mode === '--dry-run')));
} catch (error) {
  // Do not expose database connection strings or raw SQL errors in operator output.
  console.error(JSON.stringify({ granted: false, error: typeof error === 'object' && error !== null && 'code' in error ? error.code : 'TEST_GRANT_FAILED' }));
  process.exitCode = 1;
} finally { await pool.end(); }
