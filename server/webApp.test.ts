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
  assert.match(await spa.text(), /RoFinance web/);
});

test('API target rejects credentials, paths, and remote cleartext', () => {
  assert.equal(validateApiTarget('http://127.0.0.1:6869'), 'http://127.0.0.1:6869');
  assert.throws(() => validateApiTarget('http://example.org:6869'), /HTTPS/);
  assert.throws(() => validateApiTarget('https://user:pass@example.org'), /origin/);
  assert.throws(() => validateApiTarget('https://example.org/api'), /origin/);
});
