import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataApi } from '../lib/api';

test('late data loads cannot overwrite another account revision', async () => {
  const originalFetch = globalThis.fetch;
  const pendingLoads: Array<(response: Response) => void> = [];
  const savedHeaders: string[] = [];

  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'PUT') {
      savedHeaders.push(String((init.headers as Record<string, string>)?.['If-Match']));
      return Response.json({ success: true, revision: '9' });
    }
    return new Promise<Response>((resolve) => pendingLoads.push(resolve));
  };

  try {
    const firstLoad = dataApi.load('account-a');
    const secondLoad = dataApi.load('account-b');
    pendingLoads[1](Response.json({ data: null, revision: '5' }));
    await secondLoad;
    pendingLoads[0](Response.json({ data: null, revision: '2' }));
    await firstLoad;

    await dataApi.save('account-b', {});
    await dataApi.save('account-a', {});
    assert.deepEqual(savedHeaders, ['"5"', '"2"']);
    await assert.rejects(dataApi.save('unloaded-account', {}), /Cần tải dữ liệu/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
