import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parseChartGroupRequest, parseChartGroupSuggestions, type ChartGroupRequest } from '../shared/categoryChartGroups';

export function createCategoryChartRouter(authenticate: RequestHandler, suggest: (input: ChartGroupRequest) => Promise<unknown>) {
  const router = Router();
  router.use(authenticate);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.post('/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => req.authUserId!, message: { error: 'CHART_AI_RATE_LIMIT' } }), async (req, res) => {
    const input = parseChartGroupRequest(req.body);
    if (!input) { res.status(400).json({ error: 'CHART_AI_INVALID_INPUT' }); return; }
    try {
      const output = await suggest(input);
      const groups = parseChartGroupSuggestions(output, input.categories);
      if (!groups) { res.status(502).json({ error: 'CHART_AI_INVALID_OUTPUT' }); return; }
      res.json({ groups });
    } catch {
      // Do not return upstream credentials, provider response bodies or prompts.
      res.status(503).json({ error: 'CHART_AI_UNAVAILABLE' });
    }
  });
  return router;
}
