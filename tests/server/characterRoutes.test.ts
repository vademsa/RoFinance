import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { createCharacterRouter } from '../../server/characterRoutes';
import { CharacterError, CharacterStore, newCharacter, privateProfile, updateCharacter } from '../../server/characterStore';

test('HTTP character routes require authentication, derive owner and keep error responses private', async () => {
  const calls: string[] = [];
  const profiles = new Map(['owner-a', 'owner-b'].map((owner) => [owner, newCharacter({}, '2026-10-07')]));
  const store = {
    profile: async (owner: string, start?: string) => {
      calls.push(owner);
      if (start) throw new CharacterError('INVALID_CYCLE');
      return privateProfile(profiles.get(owner)!, {}, '2026-10-07');
    },
    update: async (owner: string, body: unknown) => {
      calls.push(owner);
      const state = updateCharacter(profiles.get(owner)!, body);
      profiles.set(owner, state);
      return privateProfile(state, {}, '2026-10-07');
    },
    action: async () => { throw new Error('private financial internals must not be sent'); },
    leaderboard: async (season: string) => {
      if (season !== '2026-10') throw new CharacterError('INVALID_SEASON');
      return { season, entries: [] };
    },
  } as unknown as CharacterStore;
  const app = express();
  app.use(express.json());
  app.use('/api/character', createCharacterRouter(store, (req, res, next) => {
    const owner = req.get('x-test-owner');
    if (!owner || !profiles.has(owner)) { res.status(401).json({ error: 'AUTH_REQUIRED' }); return; }
    req.authUserId = owner;
    next();
  }));
  const server = http.createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/character`;
  const headers = { 'x-test-owner': 'owner-a', 'Content-Type': 'application/json' };
  try {
    for (const path of ['profile', 'leaderboard?season=2026-10', 'draw', 'exchange', 'recycle', 'fuse']) {
      const response = await fetch(`${base}/${path}`, { method: ['draw', 'exchange', 'recycle', 'fuse'].includes(path) ? 'POST' : 'GET' });
      assert.equal(response.status, 401);
    }
    assert.equal(calls.length, 0);
    const valid = await fetch(`${base}/profile`, { headers });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('cache-control'), 'no-store');
    assert.equal((await valid.json() as any).profile.optIn, false);
    const spoofed = await fetch(`${base}/profile?userId=owner-b`, { headers });
    assert.equal(spoofed.status, 400);
    const patch = await fetch(`${base}/profile`, { method: 'PATCH', headers, body: JSON.stringify({ nickname: 'Alias A' }) });
    assert.equal(patch.status, 200);
    assert.equal(profiles.get('owner-a')!.nickname, 'Alias A');
    assert.equal(profiles.get('owner-b')!.nickname, 'Companion');
    const gender = await fetch(`${base}/profile`, { method: 'PATCH', headers, body: JSON.stringify({ gender: 'female' }) });
    assert.equal(gender.status, 200); assert.equal((await gender.json() as any).profile.gender, 'female');
    assert.equal(profiles.get('owner-b')!.gender, 'male');
    for (const body of [{ userId: 'owner-b', gender: 'female' }, { gender: 'admin' }, { gender: null }, { gender: ['female'] }, { userId: 'owner-b', optIn: true }, { score: 100 }, { characterId: 'unknown' }]) {
      const response = await fetch(`${base}/profile`, { method: 'PATCH', headers, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
    const error = await fetch(`${base}/draw`, { method: 'POST', headers, body: '{}' });
    assert.equal(error.status, 500);
    assert.deepEqual(await error.json(), { error: 'CHARACTER_UNAVAILABLE' });
    assert.equal((await fetch(`${base}/leaderboard?season=2026-10&income=1`, { headers })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
