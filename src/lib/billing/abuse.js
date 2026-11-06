import { recordAbuseEvent, countRecentAbuseEvents } from "@/lib/db/repos/abuseRepo.js";

// In-memory per-key observation windows for anti-abuse heuristics.
// Shared across modules so the counters survive hot-reload boundaries.
if (!global._abuseState) global._abuseState = { keys: {} };
const state = global._abuseState;

const WINDOW_MS = 60 * 1000;

function bucket(keyId) {
  return state.keys[keyId] || (state.keys[keyId] = { timestamps: [], ips: {}, errors: [] });
}

function prune(list, now) {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < list.length && list[i] < cutoff) i++;
  return i ? list.slice(i) : list;
}

export const ABUSE_DEFAULTS = { enabled: false, rpmThreshold: 300, multiIpThreshold: 5, errorBurstThreshold: 20 };

/**
 * Observe one request for anti-abuse signals and record events when a
 * threshold trips. Fail-open and de-duplicated (one event per kind per window).
 *
 * @param {string} keyId
 * @param {{ ip?:string|null, isError?:boolean, config?:object }} opts
 */
export async function observeKeyRequest(keyId, { ip = null, isError = false, config = null } = {}) {
  if (!keyId) return;
  const cfg = { ...ABUSE_DEFAULTS, ...(config || {}) };
  if (!cfg.enabled) return;
  try {
    const now = Date.now();
    const b = bucket(keyId);
    b.timestamps = prune(b.timestamps, now);
    b.timestamps.push(now);

    if (ip) {
      // Keep only IPs seen inside the window.
      b.ips[ip] = now;
      for (const [addr, ts] of Object.entries(b.ips)) {
        if (ts < now - WINDOW_MS) delete b.ips[addr];
      }
    }
    if (isError) {
      b.errors = prune(b.errors, now);
      b.errors.push(now);
    }

    // Rate spike
    if (b.timestamps.length > cfg.rpmThreshold) {
      await emitOnce(keyId, "rate_spike", "critical",
        `${b.timestamps.length} requests in the last minute (threshold ${cfg.rpmThreshold})`, ip);
    }
    // Multiple source IPs for one key (shared/leaked key)
    const distinctIps = Object.keys(b.ips).length;
    if (distinctIps > cfg.multiIpThreshold) {
      await emitOnce(keyId, "multi_ip", "warn",
        `key used from ${distinctIps} distinct IPs in one minute (threshold ${cfg.multiIpThreshold})`, ip);
    }
    // Error burst
    if (b.errors.length > cfg.errorBurstThreshold) {
      await emitOnce(keyId, "error_burst", "warn",
        `${b.errors.length} errors in the last minute (threshold ${cfg.errorBurstThreshold})`, ip);
    }
  } catch {
    // fail-open
  }
}

async function emitOnce(keyId, kind, severity, detail, ip) {
  const recent = await countRecentAbuseEvents(keyId, kind, WINDOW_MS);
  if (recent > 0) return;
  await recordAbuseEvent({ keyId, kind, severity, detail, ip });
}

export function resetAbuseState(keyId = null) {
  if (keyId) delete state.keys[keyId];
  else state.keys = {};
}
