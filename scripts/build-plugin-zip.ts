/**
 * Zips wp-plugin/command-center-connector into
 * public/downloads/command-center-connector.zip, so the Webhooks page can
 * just link straight to a static file instead of needing an API route to
 * stream it. Runs automatically before `next build` (see package.json).
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "wp-plugin");
const outDir = path.join(root, "public", "downloads");
const outFile = path.join(outDir, "command-center-connector.zip");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

execSync(`cd "${pluginDir}" && zip -r -q -X "${outFile}" command-center-connector -x '**/.DS_Store'`, {
  stdio: "inherit",
});

console.log(`Plugin zipped to ${path.relative(root, outFile)}`);
