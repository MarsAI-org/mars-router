#!/usr/bin/env node
// Mars Router service command for source installs.
//
//   mars-router            start the server (foreground)
//   mars-router start      same as above
//   mars-router start -d   start detached (background), writes a pidfile
//   mars-router stop       stop a detached server
//   mars-router status     report whether the server is listening
//   mars-router logs       tail the detached log file
//
// Reads PORT (default 20128) and DATA_DIR from the environment / local .env.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.PORT || 20128);
const pidFile = resolve(projectRoot, ".mars-router.pid");
const logFile = resolve(projectRoot, "mars-router.log");

const cmd = (process.argv[2] || "start").toLowerCase();
const flags = new Set(process.argv.slice(3));

function ping(port, timeoutMs = 800) {
  return new Promise((res) => {
    const s = net.connect({ host: "127.0.0.1", port: Number(port) });
    const done = (ok) => { s.destroy(); res(ok); };
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.setTimeout(timeoutMs, () => done(false));
  });
}

function readPid() {
  try { return Number(fs.readFileSync(pidFile, "utf8").trim()); } catch { return null; }
}
function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function startDetached() {
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [resolve(projectRoot, "scripts/start.mjs")], {
    detached: true, stdio: ["ignore", out, out], cwd: projectRoot,
    env: { ...process.env, PORT: port },
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  console.log(`Mars Router starting (pid ${child.pid}) on port ${port}`);
  console.log(`Logs: ${logFile}`);
}

function startForeground() {
  const child = spawn(process.execPath, [resolve(projectRoot, "scripts/start.mjs")], {
    stdio: "inherit", cwd: projectRoot, env: { ...process.env, PORT: port },
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  switch (cmd) {
    case "start":
      if (flags.has("-d") || flags.has("--detach")) startDetached();
      else startForeground();
      return;
    case "stop": {
      const pid = readPid();
      if (!isAlive(pid)) { console.log("Mars Router is not running."); return; }
      process.kill(pid, "SIGTERM");
      try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
      console.log(`Stopped Mars Router (pid ${pid}).`);
      return;
    }
    case "status": {
      const pid = readPid();
      const up = await ping(port);
      console.log(`Mars Router: ${up ? "listening" : "not reachable"} on http://localhost:${port}`);
      if (isAlive(pid)) console.log(`  detach pid: ${pid}`);
      return;
    }
    case "logs": {
      if (!fs.existsSync(logFile)) { console.log(`No log file yet (${logFile}).`); return; }
      const child = spawn("tail", ["-n", "200", "-f", logFile], { stdio: "inherit" });
      child.on("exit", () => process.exit(0));
      return;
    }
    case "-h":
    case "--help":
    case "help":
      console.log("Usage: mars-router [start [-d] | stop | status | logs]");
      return;
    default:
      console.error(`Unknown command: ${cmd}\nUsage: mars-router [start [-d] | stop | status | logs]`);
      process.exit(1);
  }
}

main();
