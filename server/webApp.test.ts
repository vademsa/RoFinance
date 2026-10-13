import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createWebApp, validateApiTarget } from './webApp';

const servers: Server[] = [];
const tempDirs: string[] = [];

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

test('web and API run in separate processes while preserving paths, bodies, and session headers', async () => {
  const apiUrl = await listen(http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.setHeader('Set-Cookie', 'rofinance.sid=test; HttpOnly');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      path: req.url, method: req.method, cookie: req.headers.cookie, host: req.headers.host,
      body: Buffer.concat(chunks).toString(), ifMatch: req.headers['if-match'],
      forwardedProto: req.headers['x-forwarded-proto'],
    }));
  }));
  const webDir = await mkdtemp(path.join(os.tmpdir(), 'rofinance-web-test-'));
  tempDirs.push(webDir);
  await writeFile(path.join(webDir, 'index.html'), '<main>RoFinance web</main>');
  const webUrl = await listen(http.createServer(createWebApp(apiUrl, webDir)));

  const response = await fetch(`${webUrl}/api/auth/me?check=1`, { headers: { Cookie: 'rofinance.sid=abc' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') || '', /rofinance\.sid=test/);
  const result = await response.json() as { path: string; method: string; cookie: string; host: string };
  assert.equal(result.path, '/api/auth/me?check=1');
  assert.equal(result.method, 'GET');
  assert.equal(result.cookie, 'rofinance.sid=abc');
  assert.equal(result.host, new URL(webUrl).host);

  const write = await fetch(`${webUrl}/api/data`, {
    method: 'PUT',
    headers: {
      Cookie: 'rofinance.sid=abc',
      'Content-Type': 'application/json',
      'If-Match': '"5"',
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ data: { monthlyIncome: 5 } }),
  });
  const posted = await write.json() as {
    path: string; method: string; body: string; ifMatch: string; forwardedProto: string;
  };
  assert.equal(posted.path, '/api/data');
  assert.equal(posted.method, 'PUT');
  assert.equal(posted.body, '{"data":{"monthlyIncome":5}}');
  assert.equal(posted.ifMatch, '"5"');
  assert.match(posted.forwardedProto, /^https/);

  const spa = await fetch(`${webUrl}/reports/history`);
  assert.equal(spa.status, 200);
  assert.equal(spa.headers.get('cache-control'), 'no-store');
  assert.match(await spa.text(), /RoFinance web/);
  const html = await fetch(`${webUrl}/index.html`);
  assert.equal(html.headers.get('cache-control'), 'no-store');
});

test('API target rejects credentials, paths, and remote cleartext', () => {
  assert.equal(validateApiTarget('http://127.0.0.1:6869'), 'http://127.0.0.1:6869');
  assert.throws(() => validateApiTarget('http://example.org:6869'), /HTTPS/);
  assert.throws(() => validateApiTarget('https://user:pass@example.org'), /origin/);
  assert.throws(() => validateApiTarget('https://example.org/api'), /origin/);
});

test('admin page namespace proxies before static and SPA fallback, preserving denial and credentials', async () => {
  const requests: { path?: string; cookie?: string; authorization?: string }[] = [];
  const apiUrl = await listen(http.createServer((req, res) => {
    requests.push({ path: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization });
    res.statusCode = req.headers.authorization === 'Bearer synthetic-owner' ? 200 : req.headers.cookie ? 403 : 401;
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(res.statusCode === 200 ? 'PROTECTED_SHELL' : 'ADMIN_DENIED');
  }));
  const webDir = await mkdtemp(path.join(os.tmpdir(), 'rofinance-admin-proxy-')); tempDirs.push(webDir);
  await writeFile(path.join(webDir, 'index.html'), 'PUBLIC_SPA_TRIPWIRE');
  await writeFile(path.join(webDir, 'admin'), 'PUBLIC_STATIC_TRIPWIRE');
  const webUrl = await listen(http.createServer(createWebApp(apiUrl, webDir)));
  for (const route of ['/admin', '/admin/', '/Admin', '/%61dmin', '/admin%2Fprivate', '/admin/not-real?role=admin']) {
    const denial = await fetch(webUrl + route); assert.equal(denial.status, 401); assert.equal(await denial.text(), 'ADMIN_DENIED');
    assert.equal(denial.headers.get('cache-control'), 'private, no-store');
  }
  const owner = await fetch(webUrl + '/admin?view=overview', { headers: { Cookie: 'rofinance.sid=synthetic', Authorization: 'Bearer synthetic-owner' } });
  assert.equal(owner.status, 200); assert.equal(await owner.text(), 'PROTECTED_SHELL');
  assert.deepEqual(requests.at(-1), { path: '/admin?view=overview', cookie: 'rofinance.sid=synthetic', authorization: 'Bearer synthetic-owner' });
  assert.equal((await fetch(webUrl + '/admin', { method: 'POST', headers: { Cookie: 'other-session' } })).status, 403);
  const publicPage = await fetch(webUrl + '/reports/history'); assert.equal(await publicPage.text(), 'PUBLIC_SPA_TRIPWIRE');
});

test('unavailable admin upstream never falls back to a public page or cacheable error', async () => {
  const upstream = http.createServer(); const apiUrl = await listen(upstream);
  await new Promise<void>(resolve => upstream.close(() => resolve()));
  const webDir = await mkdtemp(path.join(os.tmpdir(), 'rofinance-admin-down-')); tempDirs.push(webDir);
  await writeFile(path.join(webDir, 'index.html'), 'PUBLIC_SPA_TRIPWIRE');
  const webUrl = await listen(http.createServer(createWebApp(apiUrl, webDir)));
  for (const route of ['/admin', '/admin/private', '/%61dmin', '/api/admin/overview']) {
    const response = await fetch(webUrl + route); assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie, Authorization');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!(await response.text()).includes('PUBLIC_SPA_TRIPWIRE'));
  }
});
