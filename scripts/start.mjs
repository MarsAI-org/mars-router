#!/usr/bin/env node
// Cross-platform launcher for the production server.
//
// Reads PORT (default 20128) and HOSTNAME (default 0.0.0.0) from the
// environment. `next.config.mjs` sets `output: "standalone"`, so the correct
// production entry is the standalone server (built by `npm run build` +
// `scripts/copy-standalone-assets.mjs`). We fall back to the in-repo
// custom-server.js (which forwards to `next start`) when no standalone build
// exists, so `npm run start` works in both layouts.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.PORT || 20128);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const standaloneEntry = resolve(projectRoot, ".next", "standalone", "custom-server.js");
const repoEntry = resolve(projectRoot, "custom-server.js");
const entry = fs.existsSync(standaloneEntry) ? standaloneEntry : repoEntry;

const child = spawn(
  process.execPath,
  [entry, "--port", port, "--hostname", hostname],
  {
    stdio: "inherit",
    // The standalone server resolves its own directory from cwd.
    cwd: fs.existsSync(standaloneEntry) ? resolve(projectRoot, ".next", "standalone") : projectRoot,
    env: { ...process.env, PORT: port, HOSTNAME: hostname, NODE_ENV: process.env.NODE_ENV || "production" },
  }
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
