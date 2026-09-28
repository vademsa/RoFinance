module.exports = {
  apps: [
    {
      name: 'rofinance',
      script: 'dist/server.cjs',
      cwd: '/home/roll/RoFinance',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
  ],
};
