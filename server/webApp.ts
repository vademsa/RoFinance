import express from 'express';
import httpProxy from 'http-proxy';
import path from 'path';
import { isAdminPagePath } from '../shared/admin';

export function validateApiTarget(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_INTERNAL_URL phải là một HTTP(S) origin, không chứa path hoặc thông tin đăng nhập');
  }
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('API_INTERNAL_URL ngoài máy cục bộ phải dùng HTTPS');
  }
  return url.origin;
}

export function createWebApp(apiTarget: string, webDir: string) {
  const app = express();
  app.disable('x-powered-by');
  const apiProxy = httpProxy.createProxyServer({
    // Express strips the mount path before proxying; restore /api on the target.
    target: `${validateApiTarget(apiTarget)}/api`,
    changeOrigin: false,
    // Preserve ingress forwarding headers. Adding another hop here would make
    // API rate limits see only the local tunnel/web process for every user.
    xfwd: false,
  });
  apiProxy.on('error', (_error, _req, res) => {
    if ('writeHead' in res && !res.headersSent) {
      // An unavailable upstream must not turn a private response into a
      // cacheable page, including protected /admin proxy failures.
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization',
        'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify({ error: 'API tạm thời không khả dụng' }));
    } else {
      res.destroy();
    }
  });
  app.use('/api', (req, res) => apiProxy.web(req, res));

  // Protected page requests must never fall through to static/SPA content.
  app.use((req, res, next) => {
    if (isAdminPagePath(req.path)) apiProxy.web(req, res, { target: validateApiTarget(apiTarget) });
    else next();
  });

  app.use(express.static(webDir, { index: false, setHeaders: (res, file) => {
    // A reload must fetch the current HTML, not reuse an old CDN/browser shell.
    if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  } }));
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(webDir, 'index.html'));
  });
  app.use((_req, res) => {
    res.status(404).end();
  });
  return app;
}
