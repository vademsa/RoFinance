import dotenv from 'dotenv';
import pg from 'pg';
import { grantCharacterTestPoints } from '../server/characterTestGrant';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const [email, rawPoints, requestId, collection, ...extra] = process.argv.slice(2);
if (!email || !rawPoints || !requestId || extra.length || (collection !== undefined && collection !== '--full-collection') || !/^\d+$/.test(rawPoints) || !process.env.DATABASE_URL) {
  throw new Error('Usage: npx tsx scripts/grant-character-test-points.ts <email> <points> <UUID-v4> [--full-collection]; DATABASE_URL must be configured.');
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, max: 1 });
try {
  console.log(JSON.stringify(await grantCharacterTestPoints(pool, email, Number(rawPoints), requestId, collection === '--full-collection')));
} finally { await pool.end(); }
