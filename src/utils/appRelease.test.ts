import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReleaseMonitor, isAppRelease, type AppRelease } from './appRelease';

const initial: AppRelease = { apiRevision: 'a'.repeat(64), webRevision: '11111111-1111-4111-8111-111111111111' };
const next = { ...initial, apiRevision: 'b'.repeat(64), webRevision: '22222222-2222-4222-8222-222222222222' };
test('old web detects an already-published release on first check and cannot acknowledge away reload', async () => {
  let notifications = 0;
  const monitor = new ReleaseMonitor(async () => next, false, initial.webRevision, () => notifications++);
  await monitor.check();
  assert.deepEqual(monitor.pending, next);
  monitor.acknowledgeNative(next);
  assert.deepEqual(monitor.pending, next);
  assert.equal(notifications, 1);
});
test('backend-only changes trigger update and concurrent checks share a fresh request', async () => {
  let release = initial; let requests = 0;
  const monitor = new ReleaseMonitor(async () => { requests++; return release; }, false, initial.webRevision, () => {});
  await Promise.all([monitor.check(), monitor.check()]);
  assert.equal(requests, 1); assert.equal(monitor.pending, null);
  release = { ...next, webRevision: initial.webRevision };
  await monitor.check();
  assert.equal(requests, 2); assert.deepEqual(monitor.pending, release);
});
test('native ignores web builds, refreshes API changes once and cannot acknowledge a newer release accidentally', async () => {
  let release = initial;
  const monitor = new ReleaseMonitor(async () => release, true, 'packaged-mobile', () => {});
  await monitor.check();
  release = { ...initial, webRevision: next.webRevision }; await monitor.check();
  assert.equal(monitor.pending, null);
  release = next; await monitor.check(); assert.deepEqual(monitor.pending, next);
  release = { ...next, apiRevision: 'c'.repeat(64) }; await monitor.check();
  monitor.acknowledgeNative(next); assert.deepEqual(monitor.pending, release);
  monitor.acknowledgeNative(release); await monitor.check(); assert.equal(monitor.pending, null);
});
test('unavailable or malformed release never clears a pending update or poisons future checks', async () => {
  let fail = false;
  const monitor = new ReleaseMonitor(async () => { if (fail) throw new Error('offline'); return next; }, false, initial.webRevision, () => {});
  await monitor.check(); fail = true;
  await assert.rejects(() => monitor.check(), /offline/);
  assert.deepEqual(monitor.pending, next);
  assert.equal(isAppRelease({ apiRevision: 'abc', webRevision: null }), false);
  assert.equal(isAppRelease({ apiRevision: initial.apiRevision, webRevision: 42 }), false);
  fail = false; await monitor.check(); assert.deepEqual(monitor.pending, next);
});
