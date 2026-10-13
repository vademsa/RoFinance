import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { vietnamDate } from '../shared/character';
import { CharacterError, type CharacterStore } from './characterStore';

export function createCharacterRouter(store: CharacterStore, authenticate: RequestHandler) {
  const router = Router();
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.authUserId!, message: { error: 'CHARACTER_RATE_LIMIT' } }));
  const handle = (action: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await action(req)); }
    catch (error) {
      if (error instanceof CharacterError) res.status(error.status).json({ error: error.code });
      else res.status(500).json({ error: 'CHARACTER_UNAVAILABLE' });
    }
  };
  router.get('/profile', handle(async (req) => {
    if (Object.keys(req.query).some((key) => key !== 'cycleStart') || (req.query.cycleStart !== undefined && typeof req.query.cycleStart !== 'string')) throw new CharacterError('INVALID_INPUT');
    return { profile: await store.profile(req.authUserId!, req.query.cycleStart as string | undefined) };
  }));
  router.patch('/profile', handle(async (req) => ({ profile: await store.update(req.authUserId!, req.body) })));
  router.post('/draw', handle(async (req) => store.action(req.authUserId!, 'draw', req.body)));
  router.post('/exchange', handle(async (req) => store.action(req.authUserId!, 'exchange', req.body)));
  router.post('/recycle', handle(async (req) => store.action(req.authUserId!, 'recycle', req.body)));
  router.post('/fuse', handle(async (req) => store.action(req.authUserId!, 'fuse', req.body)));
  router.get('/leaderboard', handle(async (req) => {
    if (Object.keys(req.query).some((key) => key !== 'season') || (req.query.season !== undefined && typeof req.query.season !== 'string')) throw new CharacterError('INVALID_INPUT');
    return store.leaderboard(req.query.season as string || vietnamDate().slice(0, 7));
  }));
  return router;
}
