import express from 'express';
import httpProxy from 'http-proxy';
import path from 'path';

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
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'API tạm thời không khả dụng' }));
    } else {
      res.destroy();
    }
  });
  app.use('/api', (req, res) => apiProxy.web(req, res));

  app.use(express.static(webDir, { index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDir, 'index.html'));
  });
  app.use((_req, res) => {
    res.status(404).end();
  });
  return app;
}
