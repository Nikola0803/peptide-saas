import { randomBytes } from "crypto";

// Not a real CUID — just a URL-safe random token long enough to serve as a
// regenerated API key or secret without pulling in the cuid package again.
export function createId(): string {
  return randomBytes(24).toString("base64url");
}
