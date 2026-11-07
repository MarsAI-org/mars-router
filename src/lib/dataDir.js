import fs from "node:fs";
import path from "path";
import os from "os";

const APP_NAME = "mars-router";
// Legacy data dir (pre-rebrand). Read+migrated so existing installs keep data.
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

// One-time migration: move ~/.Mars Router → ~/.mars-router so an upgrade never
// loses providers, keys, settings or usage. Fail-open: on any error we keep
// using the legacy dir rather than starting empty.
function migrateLegacyDir(target) {
  const legacy = legacyDir();
  if (process.env.MARS_ROUTER_SKIP_MIGRATE === "1") return target;
  try {
    if (legacy === target) return target;
    if (!fs.existsSync(legacy)) return target;
    if (fs.existsSync(target)) return target; // already migrated / fresh dir exists
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(legacy, target);
    console.warn(`[DATA_DIR] migrated ${legacy} → ${target}`);
  } catch (e) {
    if (fs.existsSync(legacy)) {
      console.warn(`[DATA_DIR] migration failed (${e?.message}); using legacy ${legacy}`);
      return legacy;
    }
  }
  return target;
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return migrateLegacyDir(defaultDir());

  // On Windows, ignore Unix-style absolute paths (e.g. /var/lib/...) that come
  // from a Linux-targeted .env or Docker config — they are not valid here.
  if (process.platform === "win32" && /^\//.test(configured)) {
    console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows → fallback to default`);
    return migrateLegacyDir(defaultDir());
  }

  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return migrateLegacyDir(defaultDir());
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();
