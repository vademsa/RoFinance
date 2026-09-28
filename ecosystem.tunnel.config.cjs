module.exports = {
  apps: [
    {
      name: 'rofinance-tunnel',
      script: '/usr/local/bin/cloudflared',
      args: '--no-autoupdate --config /home/roll/.cloudflared/rofinance.yml tunnel run',
      cwd: '/home/roll/RoFinance',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};
