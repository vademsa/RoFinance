import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { hashPassword, normalizeEmail, validateCredentials, verifyPassword } from './auth';
import { pool } from './db';
import { createMobileSession, requireMobileAuth, revokeMobileSession, rotateMobileRefreshToken } from './mobileAuth';
import { getMobileJwtConfig } from './mobileJwt';
import { defaultDisplayName, type PublicUser } from './profile';
import { getGoogleConfig, findOrCreateOAuthUser, OAuthAccountLinkRequiredError } from './oauth';
import { verifyGoogleIdToken } from './googleIdToken';

const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử. Vui lòng thử lại sau.' },
});

const asyncRoute = (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use((_req, res, next) => {
  if (!getMobileJwtConfig()) {
    res.status(503).json({ error: 'Xác thực mobile chưa được cấu hình trên server' });
    return;
  }
  next();
});

router.get('/auth/providers', asyncRoute(async (_req, res) => {
  const googleConfig = await getGoogleConfig();
  const googleClientId = typeof googleConfig?.clientId === 'string' &&
    googleConfig.clientId.endsWith('.apps.googleusercontent.com')
    ? googleConfig.clientId : null;
  res.json({ google: Boolean(googleClientId), apple: false, googleClientId });
}));

router.post('/auth/google', limiter, asyncRoute(async (req, res) => {
  const googleConfig = await getGoogleConfig();
  if (!googleConfig?.clientId ||
    !googleConfig.clientId.endsWith('.apps.googleusercontent.com')) {
    res.status(503).json({ error: 'Đăng nhập Google chưa được cấu hình trên server' });
    return;
  }
  let identity: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    identity = await verifyGoogleIdToken(req.body?.idToken, googleConfig.clientId);
  } catch {
    res.status(401).json({ error: 'Google ID token không hợp lệ hoặc đã hết hạn' });
    return;
  }
  let account: { id: string; email: string };
  try {
    account = await findOrCreateOAuthUser('google', identity.subject, identity.email, {
      allowEmailLink: identity.allowEmailLink,
    });
  } catch (error) {
    if (error instanceof OAuthAccountLinkRequiredError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
  const userResult = await pool.query<PublicUser>(
    `SELECT id, email, display_name AS "displayName",
       CASE WHEN avatar_data IS NULL THEN NULL
         ELSE '/api/auth/avatar/' || id::text || '?v=' || avatar_version::text
       END AS "avatarUrl"
     FROM users WHERE id = $1`,
    [account.id],
  );
  res.json({ user: userResult.rows[0], ...(await createMobileSession(account.id)) });
}));

router.post('/auth/register', limiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const validationError = validateCredentials(email, req.body.password);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  try {
    const passwordHash = await hashPassword(req.body.password);
    const result = await pool.query<PublicUser>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name AS "displayName", NULL::text AS "avatarUrl"`,
      [email, passwordHash, defaultDisplayName(email)]
    );
    const user = result.rows[0];
    res.status(201).json({ user, ...(await createMobileSession(user.id)) });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'Email này đã được sử dụng' });
      return;
    }
    throw error;
  }
}));

router.post('/auth/login', limiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email || typeof req.body.password !== 'string') {
    res.status(400).json({ error: 'Email hoặc mật khẩu không hợp lệ' });
    return;
  }
  const result = await pool.query<PublicUser & { password_hash: string | null }>(
    `SELECT id, email, password_hash, display_name AS "displayName",
       CASE WHEN avatar_data IS NULL THEN NULL
         ELSE '/api/auth/avatar/' || id::text || '?v=' || avatar_version::text
       END AS "avatarUrl"
     FROM users WHERE LOWER(email) = $1`,
    [email]
  );
  const row = result.rows[0];
  if (!row?.password_hash || !(await verifyPassword(req.body.password, row.password_hash))) {
    res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    return;
  }
  const { password_hash: _passwordHash, ...user } = row;
  res.json({ user, ...(await createMobileSession(row.id)) });
}));

router.post('/auth/refresh', limiter, asyncRoute(async (req, res) => {
  const tokens = await rotateMobileRefreshToken(req.body?.refreshToken);
  if (!tokens) {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    return;
  }
  res.json(tokens);
}));

router.get('/auth/me', requireMobileAuth, asyncRoute(async (req, res) => {
  const result = await pool.query<PublicUser>(
    `SELECT id, email, display_name AS "displayName",
       CASE WHEN avatar_data IS NULL THEN NULL
         ELSE '/api/auth/avatar/' || id::text || '?v=' || avatar_version::text
       END AS "avatarUrl"
     FROM users WHERE id = $1`,
    [req.authUserId]
  );
  if (!result.rows[0]) {
    res.status(401).json({ error: 'Tài khoản không còn tồn tại' });
    return;
  }
  res.json({ user: result.rows[0] });
}));

router.post('/auth/logout', requireMobileAuth, asyncRoute(async (req, res) => {
  await revokeMobileSession(req.mobileSessionId!, req.authUserId!);
  res.json({ success: true });
}));

export default router;
