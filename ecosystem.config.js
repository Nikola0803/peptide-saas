module.exports = {
  apps: [
    {
      name: "peptides-command-center",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      instances: 1, // bump once you've confirmed single-instance works; Prisma pool size scales with instances
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
    },
  ],
};
