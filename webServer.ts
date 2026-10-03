import dotenv from 'dotenv';
import path from 'path';
import { createWebApp } from './server/webApp';

dotenv.config({ path: ['.env.local', '.env'] });

const port = Number(process.env.WEB_PORT || 6868);
const host = process.env.WEB_HOST || '127.0.0.1';
const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:6869';
const webDir = path.join(process.cwd(), 'dist', 'web');

createWebApp(apiTarget, webDir).listen(port, host, () => {
  console.log(`RoFinance web running on http://${host}:${port}`);
});
