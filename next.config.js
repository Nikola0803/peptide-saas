/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Next's default is 1MB for the whole multipart body a Server
      // Action receives -- fine for text fields, but every file upload
      // in this app (Media library, product photos, COA PDFs) goes
      // through a "use server" action (see media/actions.ts,
      // products/actions.ts's uploadProductImage/addCoaDocumentFile).
      // Any real photo (a few hundred KB to a few MB) silently blew
      // past that limit -- the request never reached the action at all,
      // so there was nothing for its own try/catch to report; the drop
      // just did nothing. Matches MAX_MEDIA_SIZE_BYTES in lib/upload.ts,
      // the limit that's actually enforced and surfaced to the user.
      bodySizeLimit: "15mb",
    },
    // Lets src/instrumentation.ts run once at server boot -- that's what
    // starts the stock-release background job (see
    // src/lib/stock-release-job.ts). Next 14 needs this flag explicitly;
    // it's on by default from Next 15 on.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
