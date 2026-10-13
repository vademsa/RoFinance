import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { CharacterError } from './characterStore';
import type { CommunityStore } from './communityStore';
export function createCommunityRouter(store: CommunityStore, authenticate: RequestHandler) {
  const router = Router();
  router.use(authenticate);
  router.use((req, res, next) => {
    const expected = req.get('X-RoFinance-Owner');
    if (expected && expected !== req.authUserId) { res.status(401).json({ error: 'ACCOUNT_CHANGED' }); return; }
    next();
  });
  router.use(rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => req.authUserId!, message: { error: 'COMMUNITY_RATE_LIMIT' } }));
  const handle = (action: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await action(req)); }
    catch (e) { res.status(e instanceof CharacterError ? e.status : 500).json({ error: e instanceof CharacterError ? e.code : 'COMMUNITY_UNAVAILABLE' }); }
  };
  router.get('/', handle(req => store.list(req.authUserId!, req.query)));
  router.post('/', rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => req.authUserId!, message: { error: 'COMMUNITY_RATE_LIMIT' } }), handle(req => store.publish(req.authUserId!, req.body)));
  router.post('/adopt', handle(req => store.adopt(req.authUserId!, req.body)));
  router.delete('/:id', handle(req => store.unpublish(req.authUserId!, req.params.id)));
  return router;
}
