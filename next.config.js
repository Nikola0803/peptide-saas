/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
    // Lets src/instrumentation.ts run once at server boot -- that's what
    // starts the stock-release background job (see
    // src/lib/stock-release-job.ts). Next 14 needs this flag explicitly;
    // it's on by default from Next 15 on.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
