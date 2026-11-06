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

const PROMPT_SCOPES = ["global", "combo"];
const PROMPT_POSITIONS = ["prepend", "append"];
const PROMPT_MAX_ENTRIES = 100;
const PROMPT_MAX_TEXT = 20000;

// Operator prompt injections. Keeps only well-formed, bounded entries.
export function sanitizePromptInjections(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const entry of input.slice(0, PROMPT_MAX_ENTRIES)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const text = typeof entry.text === "string" ? entry.text.slice(0, PROMPT_MAX_TEXT) : "";
    if (!text.trim()) continue;
    const scope = PROMPT_SCOPES.includes(entry.scope) ? entry.scope : "global";
    const position = PROMPT_POSITIONS.includes(entry.position) ? entry.position : "append";
    const name = typeof entry.name === "string" ? entry.name.slice(0, 200) : "";
    const comboName = typeof entry.comboName === "string" ? entry.comboName.slice(0, 200) : "";
    if (scope === "combo" && !comboName.trim()) continue; // a combo scope needs a target
    out.push({
      id: typeof entry.id === "string" && entry.id ? entry.id : undefined,
      name,
      text,
      enabled: entry.enabled === true,
      scope,
      comboName,
      position,
      priority: Number.isFinite(Number(entry.priority)) ? Math.floor(Number(entry.priority)) : 0,
    });
  }
  return out;
}

// /v1/models catalog control.
export function sanitizeModelCatalog(input) {
  const defaults = { hidden: [], displayNames: {}, order: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;
  const hidden = Array.isArray(input.hidden)
    ? [...new Set(input.hidden.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
    : [];
  const order = Array.isArray(input.order)
    ? [...new Set(input.order.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
    : [];
  const displayNames = {};
  if (input.displayNames && typeof input.displayNames === "object" && !Array.isArray(input.displayNames)) {
    for (const [k, v] of Object.entries(input.displayNames)) {
      if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
        displayNames[k.trim()] = v.trim().slice(0, 256);
      }
    }
  }
  return { hidden, displayNames, order };
}

// Uptime monitor config.
export function sanitizeUptimeMonitor(input) {
  const defaults = { enabled: false, intervalMinutes: 30, kinds: ["llm"], concurrency: 6, retentionDays: 30 };
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;
  const kinds = Array.isArray(input.kinds) && input.kinds.length
    ? [...new Set(input.kinds.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim()))]
    : defaults.kinds;
  return {
    enabled: input.enabled === true,
    intervalMinutes: input.intervalMinutes == null ? defaults.intervalMinutes : Math.max(1, Math.floor(toNonNegativeNumber(input.intervalMinutes)) || defaults.intervalMinutes),
    kinds,
    concurrency: input.concurrency == null ? defaults.concurrency : Math.max(1, Math.min(20, Math.floor(toNonNegativeNumber(input.concurrency)) || defaults.concurrency)),
    retentionDays: input.retentionDays == null ? defaults.retentionDays : Math.max(1, Math.floor(toNonNegativeNumber(input.retentionDays)) || defaults.retentionDays),
  };
}
