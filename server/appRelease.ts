import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Capture the RUNNING bundle once, not a replacement awaiting process restart.
export function createReleaseReader(apiBundle: string, webDir: string) {
  // Restart also picks up environment/configuration updates with unchanged code.
  const apiRevision = createHash('sha256').update(apiBundle).update(randomUUID()).digest('hex');
  return () => {
    const html = readFileSync(path.join(webDir, 'index.html'), 'utf8');
    const webRevision = html.match(/<meta\s+name="rofinance-release"\s+content="([a-f0-9-]{36})"\s*\/?\s*>/i)?.[1] ?? null;
    return { apiRevision, webRevision };
  };
}
