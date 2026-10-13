import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdminOverview, isAdminPagePath, isAdminApiPath } from '../../shared/admin';

test('admin namespace recognition includes encoded/case aliases but not unrelated public SPA pages', () => {
  for (const path of ['/admin', '/admin/', '/ADMIN', '/admin/private', '/%61dmin', '/admin%2Fprivate']) assert.equal(isAdminPagePath(path), true);
  for (const path of ['/', '/administrator', '/reports/admin', '/admin-extra', '/%zz']) assert.equal(isAdminPagePath(path), false);
  for (const path of ['/api/admin', '/api/admin/overview', '/api/ADMIN', '/api/%61dmin', '/%61pi/admin']) assert.equal(isAdminApiPath(path), true);
  for (const path of ['/api/administrator', '/api/admin-extra', '/other/api/admin']) assert.equal(isAdminApiPath(path), false);
});
test('admin response validation rejects missing authorization-shaped data, negative metrics and invalid releases', () => {
  const valid = { version: 1, mode: 'read-only', generatedAt: new Date().toISOString(), counts: { accounts: 1, characters: 1, rankingParticipants: 0, drawsLast7Days: 0 }, catalogue: { total: 112, prizes: 105, signature: 7, hidden: 7 }, release: { apiRevision: 'a'.repeat(64), webRevision: null } };
  assert.ok(isAdminOverview(valid));
  for (const value of [null, {}, { ...valid, mode: 'admin' }, { ...valid, counts: { ...valid.counts, accounts: -1 } }, { ...valid, generatedAt: 'invalid' }, { ...valid, release: {} }]) assert.equal(isAdminOverview(value), false);
});
