/**
 * PM2 Ecosystem Config — Production + UAT
 *
 * Production : pm2 start ecosystem.config.js --only pli-portal-production
 * UAT        : pm2 start ecosystem.config.js --only pli-portal-uat
 * Both       : pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    // ─────────────────────────────────────────
    // PRODUCTION
    // Path  : /home/lakshya/PLI-Portal-master/
    // Port  : 5105
    // DB    : pli_portal
    // ─────────────────────────────────────────
    {
      name: 'pli-portal-production',
      script: 'server.js',
      cwd: '/home/lakshya/PLI-Portal-master/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5105,
      },
      error_file: '/home/lakshya/logs/pli-prod-error.log',
      out_file: '/home/lakshya/logs/pli-prod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ─────────────────────────────────────────
    // UAT
    // Path  : /home/lakshyauat/
    // Port  : 5106
    // DB    : pli_portal_uat
    // ─────────────────────────────────────────
    {
      name: 'pli-portal-uat',
      script: 'server.js',
      cwd: '/home/lakshyauat/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5106,
      },
      error_file: '/home/lakshyauat/logs/error.log',
      out_file: '/home/lakshyauat/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
