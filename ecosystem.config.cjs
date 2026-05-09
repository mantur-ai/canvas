module.exports = {
  apps: [
    {
      name: "mantur-canvas",
      script: require.resolve("next/dist/bin/next"),
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      interpreter: process.execPath,
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
