/**
 * Production startup script for Railway.
 * 1. Syncs DB schema (drizzle-kit push)
 * 2. Starts the Express API server
 */
import { execSync } from "child_process";
import { spawn } from "child_process";

console.log("🚀 [start] Running DB schema sync...");
try {
  execSync("pnpm --filter @workspace/db run push", {
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("✅ [start] DB schema sync complete");
} catch (err) {
  console.error("❌ [start] DB schema sync failed:", err.message);
  process.exit(1);
}

console.log("🚀 [start] Starting API server...");
const server = spawn(
  "node",
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
  {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  },
);

server.on("exit", (code) => {
  process.exit(code ?? 1);
});
