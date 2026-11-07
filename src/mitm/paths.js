const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "mars-router";
const LEGACY_APP_NAME = "mars-router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

function legacyDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), LEGACY_APP_NAME);
  }
  return path.join(os.homedir(), `.${LEGACY_APP_NAME}`);
}

function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (configured) {
    try {
      fs.mkdirSync(configured, { recursive: true });
      return configured;
    } catch (e) {
      if (e?.code !== "EACCES" && e?.code !== "EPERM") throw e;
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
    }
  }
  // Prefer the new dir; fall back to the legacy one so an un-migrated install
  // still finds its MITM pid/cert state.
  const target = defaultDir();
  if (fs.existsSync(target)) return target;
  const legacy = legacyDir();
  return fs.existsSync(legacy) ? legacy : target;
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");
try { fs.mkdirSync(MITM_DIR, { recursive: true }); } catch {}

module.exports = { DATA_DIR, MITM_DIR };
