import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { buildJarAllocationSuggestion, parseJarAllocationRequest, type JarAllocationRequest } from '../shared/jarAllocation';

export function createJarAllocationRouter(authenticate: RequestHandler, suggest: (input: JarAllocationRequest) => Promise<unknown>) {
  const router = Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.post('/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => req.authUserId!, message: { error: 'ALLOCATION_AI_RATE_LIMIT' } }), async (req, res) => {
    const input = parseJarAllocationRequest(req.body);
    if (!input) { res.status(400).json({ error: 'ALLOCATION_AI_INVALID_INPUT' }); return; }
    try {
      const output = buildJarAllocationSuggestion(await suggest(input), input);
      if (!output) { res.status(502).json({ error: 'ALLOCATION_AI_INVALID_OUTPUT' }); return; }
      res.json(output);
    } catch {
      res.status(503).json({ error: 'ALLOCATION_AI_UNAVAILABLE' });
    }
  });
  return router;
}
