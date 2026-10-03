module.exports = {
  apps: [
    {
      name: 'rofinance-api',
      script: 'dist/api.cjs',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        API_PORT: 6869,
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
    {
      name: 'rofinance-web',
      script: 'dist/web-server.cjs',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        WEB_PORT: 6868,
        API_INTERNAL_URL: 'http://127.0.0.1:6869',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
  ],
};
