#!/usr/bin/env node
// Mars Router service command for source installs.
//
//   mars-router                     start in the foreground
//   mars-router start [-d]          start (detached with -d/--detach)
//   mars-router stop [--force]      stop a detached server
//   mars-router restart [-d]        stop (if running) then start
//   mars-router status [--json]     report whether the server is listening
//   mars-router logs [-f] [-n N]    print (and follow with -f) the log file
//   mars-router update [options]    pull the latest source, install, build, restart
//   mars-router version             show the local version + latest on npm
//   mars-router doctor              check node/deps/build/port and report problems
//   mars-router config [--json]     show the effective runtime configuration
//   mars-router open                open the dashboard in a browser
//   mars-router help                show this help
//
// Global flags (before or after the command):
//   --port <n>        service port (default: env PORT or 20128)
//   --data-dir <p>    data directory (default: env DATA_DIR or ~/.mars-router)
//   --ref <ref>       git ref for `update` (default: master)
//   --dry-run         for `update`: show what would happen, change nothing
//   --force           for `stop`: escalate to SIGKILL if SIGTERM does not work
//   --json            machine-readable output where supported
//   --no-build        for `update`: skip `npm run build`
//   --no-install      for `update`: skip `npm install`
//   --no-restart      for `update`: do not restart a running server
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import https from "node:https";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = resolve(projectRoot, ".mars-router.pid");
const logFile = resolve(projectRoot, "mars-router.log");
const pkg = readJson(resolve(projectRoot, "package.json")) || {};

// ---- argument parsing -------------------------------------------------------
// Accept flags before or after the subcommand: `mars-router --port 9000 start`
// and `mars-router start --port 9000` are equivalent.
const argv = process.argv.slice(2);
const flags = { _: [] };
const booleanFlags = new Set([
  "detach", "d", "force", "json", "dry-run", "no-build", "no-install",
  "no-restart", "follow", "f", "help", "h", "version", "v",
]);
const valueFlags = new Set(["port", "data-dir", "ref", "lines", "n"]);

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const [k, inline] = a.slice(2).split("=");
    if (valueFlags.has(k)) {
      if (inline !== undefined) flags[k] = inline;
      else if (i + 1 < argv.length) flags[k] = argv[++i];
    } else if (booleanFlags.has(k)) {
      flags[k] = true;
    } else {
      flags._.push(a);
    }
  } else if (a.startsWith("-") && a.length > 1) {
    const k = a.slice(1);
    if (booleanFlags.has(k)) flags[k] = true;
    else if (valueFlags.has(k)) {
      if (i + 1 < argv.length) flags[k] = argv[++i];
    } else flags._.push(a);
  } else {
    flags._.push(a);
  }
}

const cmd = (flags._[0] || (flags.version || flags.v ? "version" : "start")).toLowerCase();

const port = String(flags.port || process.env.PORT || 20128);
const dataDir = flags["data-dir"] || process.env.DATA_DIR || pathJoin(os.homedir(), ".mars-router");
const ref = String(flags.ref || process.env.MARS_ROUTER_REF || "master");
const follow = !!(flags.follow || flags.f);
const detach = !!(flags.detach || flags.d);
const wantJson = !!flags.json;

function pathJoin(a, b) { return `${a.replace(/[\\/]+$/, "")}${require_sep()}${b}`; }
function require_sep() { return process.platform === "win32" ? "\\" : "/"; }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// ---- helpers ----------------------------------------------------------------
function runPortEnv() {
  return { ...process.env, PORT: port, DATA_DIR: dataDir };
}

function ping(p, timeoutMs = 800) {
  return new Promise((res) => {
    const s = net.connect({ host: "127.0.0.1", port: Number(p) });
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
function clearPidFile() {
  try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function printHelp() {
  console.log(`Mars Router ${pkg.version || ""} — service command

Usage: mars-router <command> [options]

Commands:
  start [-d]        Start the server (foreground; -d/--detach = background)
  stop [--force]    Stop a detached server (--force escalates to SIGKILL)
  restart [-d]      Stop if running, then start
  status [--json]   Report whether the server is listening
  logs [-f] [-n N]  Print the last N log lines (follow with -f)
  update [opts]     Pull the latest source, install, build, restart
  version           Show the local version and the latest on npm
  doctor            Check node/deps/build/port and report problems
  config [--json]   Show the effective runtime configuration
  open              Open the dashboard in a browser
  help              Show this help

Options:
  --port <n>        Service port (default: $PORT or 20128)
  --data-dir <p>    Data directory (default: $DATA_DIR or ~/.mars-router)
  --ref <ref>       Git ref for update (default: master)
  --dry-run         update: show actions without changing anything
  --no-install      update: skip npm install
  --no-build        update: skip npm run build
  --no-restart      update: do not restart a running server
  --json            machine-readable output where supported`);
}

// ---- commands ---------------------------------------------------------------
function startDetached() {
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [resolve(projectRoot, "scripts/start.mjs")], {
    detached: true, stdio: ["ignore", out, out], cwd: projectRoot, env: runPortEnv(),
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  console.log(`Mars Router starting (pid ${child.pid}) on port ${port}`);
  console.log(`Data: ${dataDir}`);
  console.log(`Logs: ${logFile}`);
}

function startForeground() {
  const child = spawn(process.execPath, [resolve(projectRoot, "scripts/start.mjs")], {
    stdio: "inherit", cwd: projectRoot, env: runPortEnv(),
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function stopServer() {
  const pid = readPid();
  if (!isAlive(pid)) {
    // Could still be listening if started via `npm run start` (no pidfile).
    if (await ping(port)) {
      console.log(`No pidfile, but something is listening on port ${port}.`);
      console.log("Stop it manually or start it via `mars-router start -d` so it can be managed.");
    } else {
      console.log("Mars Router is not running.");
    }
    clearPidFile();
    return false;
  }
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 20; i++) {
    if (!isAlive(pid)) break;
    await sleep(100);
  }
  if (isAlive(pid)) {
    if (flags.force) {
      try { process.kill(pid, "SIGKILL"); } catch { /* ignore */ }
      console.log(`Force-killed Mars Router (pid ${pid}).`);
    } else {
      console.log(`Mars Router (pid ${pid}) did not exit; retry with --force.`);
      return false;
    }
  } else {
    console.log(`Stopped Mars Router (pid ${pid}).`);
  }
  clearPidFile();
  return true;
}

async function statusCmd() {
  const pid = readPid();
  const up = await ping(port);
  const alive = isAlive(pid);
  if (wantJson) {
    console.log(JSON.stringify({ port: Number(port), dataDir, listening: up, pid: alive ? pid : null, version: pkg.version || null }, null, 2));
    return;
  }
  console.log(`Mars Router ${pkg.version || ""}`.trim());
  console.log(`  state:    ${up ? "listening" : "not reachable"}`);
  console.log(`  url:      http://localhost:${port}`);
  console.log(`  data:     ${dataDir}`);
  if (alive) console.log(`  pid:      ${pid}`);
}

function tailLines(file, n) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-n);
}

function logsCmd() {
  if (!fs.existsSync(logFile)) { console.log(`No log file yet (${logFile}).`); return; }
  const n = Math.max(1, parseInt(flags.lines || flags.n || "200", 10) || 200);
  if (!follow) {
    console.log(tailLines(logFile, n).join("\n"));
    return;
  }
  // Follow: print the tail, then stream new bytes (cross-platform, no `tail`).
  console.log(tailLines(logFile, n).join("\n"));
  let pos = fs.statSync(logFile).size;
  const timer = setInterval(() => {
    try {
      const size = fs.statSync(logFile).size;
      if (size < pos) pos = 0; // truncated
      if (size === pos) return;
      const fd = fs.openSync(logFile, "r");
      const buf = Buffer.alloc(size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      pos = size;
      process.stdout.write(buf);
    } catch { /* ignore */ }
  }, 500);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { clearInterval(timer); process.exit(0); });
}

function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", ...opts });
}

function isGitRepo() {
  const r = git(["rev-parse", "--is-inside-work-tree"]);
  return r.status === 0 && r.stdout.trim() === "true";
}

async function updateCmd() {
  const dry = !!flags["dry-run"];
  console.log(`Mars Router update (ref: ${ref}${dry ? ", dry-run" : ""})`);

  if (!isGitRepo()) {
    console.error("This install is not a git checkout, so it cannot self-update.");
    console.error("Re-run the installer to update: curl -fsSL https://raw.githubusercontent.com/MarsAI-org/mars-router/master/install.sh | sh");
    process.exit(1);
  }

  // Refuse to clobber uncommitted work.
  const status = git(["status", "--porcelain"]).stdout.trim();
  if (status) {
    console.error("Working tree has local changes. Commit/stash them first, or re-run the installer.");
    console.error(status.split("\n").slice(0, 10).join("\n"));
    process.exit(1);
  }

  const steps = [];
  const step = (label, fn) => steps.push({ label, fn });

  step(`git fetch origin ${ref}`, () => git(["fetch", "--depth", "1", "origin", ref]));
  step(`git merge --ff-only FETCH_HEAD`, () => git(["merge", "--ff-only", "FETCH_HEAD"]));
  if (!flags["no-install"]) step("npm install", () => spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: projectRoot, stdio: "inherit" }));
  if (!flags["no-build"]) step("npm run build", () => spawnSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "inherit" }));

  const wasRunning = isAlive(readPid()) || (await ping(port));
  if (wasRunning && !flags["no-restart"]) {
    step("stop server", async () => { await stopServer(); });
    step("start server", async () => { startDetached(); await sleep(1500); });
  }

  for (const s of steps) {
    if (dry) { console.log(`  would: ${s.label}`); continue; }
    console.log(`\n==> ${s.label}`);
    const res = await s.fn();
    if (res && typeof res === "object" && "status" in res && res.status !== 0) {
      console.error(`Failed: ${s.label}`);
      process.exit(1);
    }
  }

  if (dry) { console.log("\nDry run complete; nothing changed."); return; }
  console.log(`\nUpdated to ${readJson(resolve(projectRoot, "package.json"))?.version || "latest"}.`);
  if (wasRunning && !flags["no-restart"]) console.log(`Dashboard: http://localhost:${port}/dashboard`);
  else console.log("Start it with: mars-router start -d");
}

function fetchLatestNpm() {
  return new Promise((res) => {
    const req = https.get("https://registry.npmjs.org/mars-router/latest", { timeout: 4000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d).version || null); } catch { res(null); } });
    });
    req.on("error", () => res(null));
    req.on("timeout", () => { req.destroy(); res(null); });
  });
}

async function versionCmd() {
  const latest = await fetchLatestNpm();
  if (wantJson) {
    console.log(JSON.stringify({ version: pkg.version || null, latestNpm: latest, node: process.version }, null, 2));
    return;
  }
  console.log(`Mars Router: ${pkg.version || "unknown"}`);
  console.log(`Latest on npm: ${latest || "not published / offline"}`);
  console.log(`Node.js: ${process.version} (${process.platform}/${process.arch})`);
}

async function doctorCmd() {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(["Node.js >= 20", nodeMajor >= 20, process.version]);
  checks.push([".next build exists", fs.existsSync(resolve(projectRoot, ".next", "BUILD_ID")), resolve(projectRoot, ".next")]);
  checks.push(["node_modules present", fs.existsSync(resolve(projectRoot, "node_modules")), resolve(projectRoot, "node_modules")]);
  checks.push(["port reachable", await ping(port), `http://localhost:${port}`]);
  checks.push(["data dir writable", canWrite(dataDir), dataDir]);

  if (wantJson) {
    console.log(JSON.stringify(checks.map(([name, ok, detail]) => ({ name, ok, detail })), null, 2));
    return;
  }
  console.log("Mars Router doctor");
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}  (${detail})`);
  }
  const bad = checks.filter(([, ok]) => !ok);
  if (bad.length) {
    console.log("\nProblems found:");
    for (const [name] of bad) {
      if (name === ".next build exists") console.log("  - run: npm run build");
      else if (name === "node_modules present") console.log("  - run: npm install");
      else if (name === "Node.js >= 20") console.log("  - install Node.js 20+: https://nodejs.org/");
      else if (name === "port reachable") console.log("  - start it: mars-router start -d");
    }
  } else {
    console.log("\nAll checks passed.");
  }
}

function canWrite(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; }
  catch { return false; }
}

function configCmd() {
  const cfg = {
    version: pkg.version || null,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    port: Number(port),
    dataDir,
    installDir: projectRoot,
    logFile,
    pidFile,
    ref,
    dashboard: `http://localhost:${port}/dashboard`,
    api: `http://localhost:${port}/v1`,
  };
  if (wantJson) { console.log(JSON.stringify(cfg, null, 2)); return; }
  for (const [k, v] of Object.entries(cfg)) console.log(`${k}: ${v}`);
}

function openCmd() {
  const url = `http://localhost:${port}/dashboard`;
  const platform = process.platform;
  const cmdName = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmdName, args, { stdio: "ignore", detached: true });
  child.on("error", () => console.log(`Open this URL: ${url}`));
  child.unref();
  console.log(`Opening ${url}`);
}

async function main() {
  switch (cmd) {
    case "start":
      if (detach) startDetached();
      else startForeground();
      return;
    case "stop":
      await stopServer();
      return;
    case "restart":
      await stopServer();
      await sleep(300);
      if (detach) startDetached();
      else startForeground();
      return;
    case "status":
      await statusCmd();
      return;
    case "logs":
      logsCmd();
      return;
    case "update":
      await updateCmd();
      return;
    case "version":
      await versionCmd();
      return;
    case "doctor":
      await doctorCmd();
      return;
    case "config":
      configCmd();
      return;
    case "open":
      openCmd();
      return;
    case "-h":
    case "--help":
    case "help":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main();