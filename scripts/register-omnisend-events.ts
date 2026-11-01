import { ensureEvlvEventSchemas } from "../src/lib/omnisend";

const ok = await ensureEvlvEventSchemas();
if (!ok) {
  console.warn("Omnisend event schemas were not registered (API key missing or request failed).");
  process.exitCode = 1;
} else {
  console.log("Omnisend event schemas are ready.");
}
