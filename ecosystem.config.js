// PM2 config for the VM deployment (modelled on weekly-platform-kpi's — same conventions).
// Runs the Express server on port 8085 under root PM2 on vm-claude-code, persisted via
// pm2-root.service. Secrets are NOT set here: server/index.js loads them from .env (dotenv),
// which lives only on the VM at /opt/deliveroo-fee-risk/.env.
//
// Deploy:   pm2 start ecosystem.config.js && pm2 save
// Redeploy: cd /opt/deliveroo-fee-risk && git pull && npm install --omit=dev && pm2 restart deliveroo-fee-risk
module.exports = {
  apps: [
    {
      name: "deliveroo-fee-risk",
      script: "server/index.js",
      cwd: "/opt/deliveroo-fee-risk",
      env: {
        NODE_ENV: "production",
        PORT: "8085",
      },
      max_memory_restart: "500M",
      instances: 1,
      autorestart: true,
    },
  ],
};
