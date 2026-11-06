// Sanitizers for the flexible routing-control settings (providerLimits,
// retryPolicy, fallbackPolicy). Kept dependency-free so they are trivially
// unit-testable and reusable from request handlers (defense-in-depth, CWE-915).

const LIMIT_NUMERIC_KEYS = ["rpm", "tpm", "dailyRequests", "dailyTokens", "dailyCost", "monthlyCost"];

export function toNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function sanitizeProviderLimits(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [provider, entry] of Object.entries(input)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const clean = { enabled: entry.enabled === true, enforce: entry.enforce !== false };
    for (const key of LIMIT_NUMERIC_KEYS) clean[key] = toNonNegativeNumber(entry[key]);
    out[String(provider)] = clean;
  }
  return out;
}

function sanitizeRetryEntry(entry) {
  if (typeof entry === "number") return { attempts: Math.max(0, Math.floor(entry)) };
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const clean = {};
  if (entry.attempts != null) clean.attempts = Math.max(0, Math.floor(toNonNegativeNumber(entry.attempts)));
  if (entry.delayMs != null) clean.delayMs = Math.max(0, Math.floor(toNonNegativeNumber(entry.delayMs)));
  return Object.keys(clean).length ? clean : null;
}

export function sanitizeRetryPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { enabled: false };
  const out = { enabled: input.enabled === true };
  if (input.default && typeof input.default === "object" && !Array.isArray(input.default)) {
    const def = {};
    for (const [status, entry] of Object.entries(input.default)) {
      if (!/^\d+$/.test(status)) continue;
      const clean = sanitizeRetryEntry(entry);
      if (clean) def[Number(status)] = clean;
    }
    if (Object.keys(def).length) out.default = def;
  }
  if (input.byProvider && typeof input.byProvider === "object" && !Array.isArray(input.byProvider)) {
    const by = {};
    for (const [provider, statuses] of Object.entries(input.byProvider)) {
      if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) continue;
      const def = {};
      for (const [status, entry] of Object.entries(statuses)) {
        if (!/^\d+$/.test(status)) continue;
        const clean = sanitizeRetryEntry(entry);
        if (clean) def[Number(status)] = clean;
      }
      if (Object.keys(def).length) by[String(provider)] = def;
    }
    if (Object.keys(by).length) out.byProvider = by;
  }
  return out;
}

export function sanitizeFallbackPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  if (input.accountFallbackEnabled != null) out.accountFallbackEnabled = input.accountFallbackEnabled === true;
  if (input.comboFallbackEnabled != null) out.comboFallbackEnabled = input.comboFallbackEnabled === true;
  if (Array.isArray(input.extraFallbackStatuses)) {
    out.extraFallbackStatuses = [...new Set(
      input.extraFallbackStatuses
        .map((s) => Number(s))
        .filter((s) => Number.isInteger(s) && s >= 100 && s < 600)
    )];
  }
  return out;
}

// Anti-abuse monitoring config. Thresholds are positive integers; 0 disables
// that specific check (the master `enabled` flag still gates everything).
export function sanitizeAbuseMonitoring(input) {
  const defaults = { enabled: false, rpmThreshold: 300, multiIpThreshold: 5, errorBurstThreshold: 20 };
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;
  const out = { enabled: input.enabled === true };
  for (const key of ["rpmThreshold", "multiIpThreshold", "errorBurstThreshold"]) {
    out[key] = input[key] == null ? defaults[key] : Math.max(0, Math.floor(toNonNegativeNumber(input[key])));
  }
  return out;
}
