// Runs once when the Next.js server process boots (needs
// experimental.instrumentationHook in next.config.js on Next 14). This is
// where the stock-release background job starts — see
// src/lib/stock-release-job.ts for what it does and why a plain interval
// is enough given this app runs as a single long-lived pm2 process.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startStockReleaseJob } = await import("@/lib/stock-release-job");
    startStockReleaseJob();
  }
}
