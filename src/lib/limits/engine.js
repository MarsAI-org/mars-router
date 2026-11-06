import { WINDOW_MS, LIMIT_DEFAULTS, LIMIT_KINDS, mergeLimitConfig } from "./constants.js";

// In-memory sliding-window counters shared across Next.js modules.
// Shape: minute -> { [provider]: { requests: [ts...], tokens: [ts...] } }
if (!global._providerLimitState) {
  global._providerLimitState = {
    minute: {},   // provider -> { requests: number[], tokens: number[] }
    daily: {},    // provider -> { requests: number, tokens: number, cost: number, resetAt: number }
    monthly: {},  // provider -> { cost: number, resetAt: number }
  };
}
const state = global._providerLimitState;

function pruneTimestamps(list, now, windowMs) {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < list.length && list[i] < cutoff) i++;
  return i > 0 ? list.slice(i) : list;
}

function bumpMinute(provider, tokens, now) {
  const entry = state.minute[provider] || (state.minute[provider] = { requests: [], tokens: [] });
  entry.requests = pruneTimestamps(entry.requests, now, WINDOW_MS.minute);
  if (tokens > 0) entry.tokens = pruneTimestamps(entry.tokens, now, WINDOW_MS.minute);
  entry.requests.push(now);
  if (tokens > 0) entry.tokens.push([now, tokens]);
  return entry;
}

function sumWindow(list, now, windowMs) {
  const cutoff = now - windowMs;
  let total = 0;
  for (const item of list) {
    if (Array.isArray(item)) {
      if (item[0] >= cutoff) total += item[1];
    } else if (item >= cutoff) {
      total += 1;
    }
  }
  return total;
}

/**
 * Read the current rolling-window usage for a provider without mutating it.
 * @returns {{ rpm:number, tpm:number, dailyRequests:number, dailyTokens:number, dailyCost:number, monthlyCost:number }}
 */
export function getRollingUsage(provider) {
  const now = Date.now();
  const minute = state.minute[provider] || { requests: [], tokens: [] };
  const month = WINDOW_MS.month;
  const monthCutoff = now - month;

  const daily = state.daily[provider] || null;
  const dailyValid = daily && daily.resetAt > now ? daily : { requests: 0, tokens: 0, cost: 0, resetAt: 0 };

  const monthly = state.monthly[provider] || null;
  const monthlyValid = monthly && monthly.resetAt > now ? monthly : { cost: 0, resetAt: 0 };

  return {
    rpm: sumWindow(pruneTimestamps(minute.requests, now, WINDOW_MS.minute), now, WINDOW_MS.minute),
    tpm: sumWindow(pruneTimestamps(minute.tokens, now, WINDOW_MS.minute), now, WINDOW_MS.minute),
    dailyRequests: dailyValid.requests,
    dailyTokens: dailyValid.tokens,
    dailyCost: dailyValid.cost,
    monthlyCost: monthlyValid.cost,
    monthCutoff,
  };
}

/**
 * Evaluate a provider's limits against current usage.
 * @param {string} provider
 * @param {object} rawLimit - the per-provider entry from settings.providerLimits
 * @param {object} [usageOverride] - optional rolling usage (for tests)
 * @returns {{ allowed:boolean, breachedKind?:string, limit?:number, current?:number }}
 */
export function checkProviderLimits(provider, rawLimit, usageOverride = null) {
  const limit = mergeLimitConfig(rawLimit);
  if (!limit.enabled) return { allowed: true };

  const usage = usageOverride || getRollingUsage(provider);

  const checks = [
    ["rpm", usage.rpm, limit.rpm],
    ["tpm", usage.tpm, limit.tpm],
    ["dailyRequests", usage.dailyRequests, limit.dailyRequests],
    ["dailyTokens", usage.dailyTokens, limit.dailyTokens],
    ["dailyCost", usage.dailyCost, limit.dailyCost],
    ["monthlyCost", usage.monthlyCost, limit.monthlyCost],
  ];

  for (const [kind, current, cap] of checks) {
    if (cap > 0 && current >= cap) {
      return { allowed: false, breachedKind: kind, limit: cap, current };
    }
  }
  return { allowed: true };
}

/**
 * Record a completed request for a provider. Fail-open: never throws.
 */
export function recordProviderUsage(provider, options = {}) {
  try {
    if (!provider) return;
    const opts = options || {};
    const tokens = Number(opts.tokens) || 0;
    const cost = Number(opts.cost) || 0;
    const now = Date.now();

    bumpMinute(provider, tokens, now);

    let daily = state.daily[provider];
    if (!daily || daily.resetAt <= now) {
      daily = state.daily[provider] = { requests: 0, tokens: 0, cost: 0, resetAt: now + WINDOW_MS.day };
    }
    daily.requests += 1;
    daily.tokens += Number(tokens) || 0;
    daily.cost += Number(cost) || 0;

    let monthly = state.monthly[provider];
    if (!monthly || monthly.resetAt <= now) {
      monthly = state.monthly[provider] = { cost: 0, resetAt: now + WINDOW_MS.month };
    }
    monthly.cost += Number(cost) || 0;
  } catch {
    // fail-open
  }
}

/**
 * Build the 429 payload for an enforced breach.
 */
export function buildLimitBreach(provider, result) {
  const kindLabel = LIMIT_KINDS[result.breachedKind] || result.breachedKind;
  return {
    provider,
    kind: result.breachedKind,
    message: `[${provider}] ${kindLabel} limit reached (${result.current}/${result.limit}).`,
    retryAfterMs: WINDOW_MS.minute,
  };
}

/**
 * Reset all in-memory limit state (tests + manual recovery).
 */
export function resetProviderLimitState() {
  state.minute = {};
  state.daily = {};
  state.monthly = {};
}

export { LIMIT_DEFAULTS, LIMIT_KINDS };
