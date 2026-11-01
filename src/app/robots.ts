import type { MetadataRoute } from "next";

/** The CRM is a private operations application, never a public search page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
