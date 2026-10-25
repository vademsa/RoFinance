import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createReleaseReader } from '../../server/appRelease';

test('release reader exposes only opaque identifiers and sees web publication without restarting API', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rofinance-release-test-'));
  try {
    const reader = createReleaseReader('test runtime bundle', dir);
    const file = path.join(dir, 'index.html');
    const id = '11111111-1111-4111-8111-111111111111';
    await writeFile(file, `<meta name="rofinance-release" content="${id}">`);
    const old = reader();
    assert.equal(old.webRevision, id); assert.match(old.apiRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(old).sort(), ['apiRevision', 'webRevision']);
    await writeFile(file, '<meta name="rofinance-release" content="22222222-2222-4222-8222-222222222222">');
    assert.notEqual(reader().webRevision, id); assert.equal(reader().apiRevision, old.apiRevision);
    assert.notEqual(createReleaseReader('new runtime bundle', dir)().apiRevision, old.apiRevision);
    await writeFile(file, '<main>legacy build</main>'); assert.equal(reader().webRevision, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
