module.exports = {
  apps: [
    {
      name: "mantur-canvas",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: "3000",
      },
    },
  ],
};
