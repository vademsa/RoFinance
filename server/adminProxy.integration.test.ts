import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import session from 'express-session';
import { chromium, expect } from '@playwright/test';
import { ADMIN_ACCOUNT_EMAIL, ADMIN_ACCOUNT_ID } from './adminAccess';
import { AdminStore } from './adminStore';
import { ADMIN_SCHEMA_SQL } from './adminSchema';
import { CHARACTER_SCHEMA_SQL } from './characterSchema';
import { adminErrorBoundary, createAdminPageHandler, createAdminRouter, earlyAdminHeaders } from './adminRoutes';
import { createWebApp } from './webApp';

// RUN_ADMIN_PROXY_INTEGRATION=1 ADMIN_TEST_WEB_DIR=/absolute/staged/web
// A real browser, signed session, production proxy/router/store and unique DB
// schema are used. No request interception or production account writes.
test('real admin browser -> web proxy -> signed-session API -> isolated PostgreSQL writes', {
  skip: process.env.RUN_ADMIN_PROXY_INTEGRATION !== '1', timeout: 120000,
}, async () => {
  const directory = process.env.ADMIN_TEST_WEB_DIR;
  assert.ok(directory && path.isAbsolute(directory));
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const revision = html.match(/name="rofinance-release" content="([^"]+)"/)?.[1]; assert.ok(revision);
  const { pool } = await import('./db'); const { Pool } = await import('pg');
  const { requireAuth } = await import('./auth');
  const schema = `admin_proxy_${randomUUID().replaceAll('-', '')}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const database = new Pool({ ...pool.options, options: `-c search_path=${schema}` });
  const target = randomUUID(); const other = randomUUID();
  let apiServer: http.Server | undefined; let webServer: http.Server | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await database.query(`CREATE TABLE users(id UUID PRIMARY KEY,email TEXT,display_name TEXT,created_at TIMESTAMPTZ DEFAULT NOW());`);
    await database.query(CHARACTER_SCHEMA_SQL); await database.query(ADMIN_SCHEMA_SQL);
    await database.query('INSERT INTO users(id,email,display_name) VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9)', [ADMIN_ACCOUNT_ID, ADMIN_ACCOUNT_EMAIL, 'Owner fixture', target, 'target@example.test', 'New user fixture', other, 'other@example.test', 'Other fixture']);
    const api = express(); api.set('trust proxy', 1); api.use(earlyAdminHeaders, express.json());
    api.use(session({ secret: randomBytes(32).toString('hex'), resave: false, saveUninitialized: false }));
    // Test-only ephemeral local server: never included in the application bundle.
    api.post('/api/fixture-login/:kind', (req, res) => { req.session.userId = req.params.kind === 'owner' ? ADMIN_ACCOUNT_ID : other; res.json({ ok: true }); });
    api.use(createAdminPageHandler(database, requireAuth, directory));
    api.use('/api/admin', createAdminRouter(database, requireAuth, () => ({ apiRevision: 'a'.repeat(64), webRevision: revision }), new AdminStore(database)));
    api.use(adminErrorBoundary);
    apiServer = http.createServer(api).listen(0, '127.0.0.1'); await once(apiServer, 'listening');
    const apiAddress = apiServer.address(); assert.ok(apiAddress && typeof apiAddress !== 'string');
    webServer = http.createServer(createWebApp(`http://127.0.0.1:${apiAddress.port}`, directory)).listen(0, '127.0.0.1'); await once(webServer, 'listening');
    const webAddress = webServer.address(); assert.ok(webAddress && typeof webAddress !== 'string');
    const base = `http://127.0.0.1:${webAddress.port}`;
    assert.equal((await fetch(base + '/admin')).status, 401);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    assert.equal((await context.request.post(base + '/api/fixture-login/owner')).status(), 200);
    await page.goto(base + '/admin'); await page.getByRole('button', { name: 'Chuyển sang tiếng Anh' }).click();
    await page.getByRole('button', { name: 'Accounts', exact: true }).click();
    const manage = async (action: string) => {
      await page.locator('.admin-account').filter({ hasText: 'target@example.test' }).getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption(action);
      await page.getByRole('textbox', { name: 'Reason · 5–300 characters' }).fill('Isolated real proxy operation');
    };
    const finish = async () => {
      await page.getByRole('button', { name: 'Review and confirm' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm operation' }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.getByText('Completed and recorded in the audit trail.')).toBeVisible();
    };
    await manage('grant-points'); await page.getByRole('textbox', { name: 'Points · 1–100,000' }).fill('120'); await finish();
    let state = (await database.query('SELECT state FROM character_profiles WHERE user_id=$1', [target])).rows[0].state;
    assert.equal(state.bonusPoints, 120); assert.equal(state.pendingEnrollment, true);
    await manage('grant-item'); await page.getByRole('combobox', { name: 'Item', exact: true }).selectOption('shirt-rofinance'); await page.getByRole('spinbutton', { name: 'Copies · 1–100' }).fill('7'); await finish();
    await manage('revoke-item'); await page.getByRole('combobox', { name: 'Owned item' }).selectOption('shirt-rofinance');
    await page.getByRole('spinbutton', { name: 'Copies to revoke' }).fill('3'); await finish();
    state = (await database.query('SELECT state FROM character_profiles WHERE user_id=$1', [target])).rows[0].state;
    assert.equal(state.duplicateItemCounts['shirt-rofinance'], 3); assert.equal(state.bonusPoints, 120);
    await manage('revoke-points'); await page.getByRole('textbox', { name: 'Points · 1–100,000' }).fill('40'); await finish();
    state = (await database.query('SELECT state FROM character_profiles WHERE user_id=$1', [target])).rows[0].state;
    assert.equal(state.revokedPoints, 40); assert.equal(state.bonusPoints, 120); assert.equal(state.spentPoints, 0);
    assert.equal((await database.query('SELECT COUNT(*)::int AS n FROM admin_operations')).rows[0].n, 4);
    const receipt = (await database.query("SELECT request_id,reason FROM admin_operations WHERE kind='grant-points'")).rows[0];
    const body = { requestId: receipt.request_id, targetId: target, points: 120, reason: receipt.reason };
    const replay = await context.request.post(base + '/api/admin/operations/grant-points', { headers: { Origin: base }, data: body });
    assert.equal(replay.status(), 200); assert.equal((await replay.json()).replayed, true);
    assert.equal((await database.query('SELECT state FROM character_profiles WHERE user_id=$1', [target])).rows[0].state.bonusPoints, 120);
    const rejected = await context.request.post(base + '/api/admin/operations/grant-points', { headers: { Origin: 'https://attacker.invalid' }, data: { ...body, requestId: randomUUID() } }); assert.equal(rejected.status(), 403);
    await page.getByRole('button', { name: 'Admin audit trail', exact: true }).click(); await expect(page.locator('.admin-audit')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    assert.deepEqual(browserErrors, []);
    const denied = await browser.newContext(); await denied.request.post(base + '/api/fixture-login/other');
    assert.equal((await denied.request.get(base + '/admin')).status(), 403);
    assert.equal((await denied.request.get(base + `/api/admin/accounts/${target}/inventory`)).status(), 403);
    assert.equal((await denied.request.post(base + '/api/admin/operations/revoke-item', { headers: { Origin: base }, data: { requestId: randomUUID(), targetId: target, reason: 'Must never succeed', itemId: 'shirt-rofinance', copies: 1 } })).status(), 403);
    await denied.close(); await context.close();
  } finally {
    await browser?.close();
    for (const server of [webServer, apiServer]) if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
    await database.end(); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end();
  }
});
