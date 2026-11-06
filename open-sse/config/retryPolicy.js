import { DEFAULT_RETRY_CONFIG, RETRY_CONFIG, resolveRetryEntry } from "./runtimeConfig.js";

// Status codes a user may override via settings.retryPolicy.byStatus.
export const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

// Fallback policy knobs exposed to the dashboard. Defaults mirror current
// hardcoded behaviour so enabling the feature without changes is a no-op.
export const FALLBACK_POLICY_DEFAULTS = {
  // When false, a provider-scoped error never rotates the account/connection.
  accountFallbackEnabled: true,
  // When false, combo members are not rotated on request-scoped errors.
  comboFallbackEnabled: true,
  // Extra statuses (beyond the built-in rules) that should rotate the account.
  extraFallbackStatuses: [],
  // Cap the exponential backoff (ms) for rate-limit cooldowns.
  maxBackoffMs: 0, // 0 = keep built-in cap
};

/**
 * Resolve the effective retry config for a provider by layering:
 * built-in defaults → per-provider registry config → user settings overrides.
 * Fail-open: returns the registry config untouched when settings are absent/bad.
 *
 * @param {string} provider
 * @param {object|null} baseRetryConfig - executor's own config.retry
 * @param {object|null} settings - full app settings
 * @returns {object} merged retry config keyed by status code
 */
export function resolveRetryConfig(provider, baseRetryConfig = null, settings = null) {
  const merged = { ...DEFAULT_RETRY_CONFIG, ...(baseRetryConfig || {}) };
  const policy = settings?.retryPolicy;
  if (!policy || policy.enabled !== true) return merged;

  const global = policy.default;
  if (global && typeof global === "object") {
    for (const status of RETRYABLE_STATUSES) {
      if (global[status] == null) continue;
      merged[status] = normalizeRetryEntry(global[status], merged[status]);
    }
  }

  const perProvider = policy.byProvider?.[provider];
  if (perProvider && typeof perProvider === "object") {
    for (const [statusKey, entry] of Object.entries(perProvider)) {
      const status = Number(statusKey);
      if (!Number.isFinite(status)) continue;
      merged[status] = normalizeRetryEntry(entry, merged[status]);
    }
  }
  return merged;
}

// Accept a number (attempts), or { attempts, delayMs }; keep the prior value
// for any field the user did not supply.
function normalizeRetryEntry(entry, fallback) {
  const prev = resolveRetryEntry(fallback);
  if (typeof entry === "number") {
    return { attempts: Math.max(0, entry | 0), delayMs: prev.delayMs };
  }
  if (entry && typeof entry === "object") {
    const attempts = entry.attempts != null ? Math.max(0, Number(entry.attempts) | 0) : prev.attempts;
    const delayMs = entry.delayMs != null ? Math.max(0, Number(entry.delayMs) | 0) : prev.delayMs;
    return { attempts, delayMs };
  }
  return fallback ?? { ...RETRY_CONFIG };
}

/**
 * Resolve the effective fallback policy from settings.
 * Fail-open: always returns a valid policy object.
 */
export function resolveFallbackPolicy(settings = null) {
  const raw = settings?.fallbackPolicy;
  if (!raw || typeof raw !== "object") return { ...FALLBACK_POLICY_DEFAULTS };
  return {
    ...FALLBACK_POLICY_DEFAULTS,
    ...raw,
    extraFallbackStatuses: Array.isArray(raw.extraFallbackStatuses)
      ? raw.extraFallbackStatuses.map(Number).filter(Number.isFinite)
      : [],
  };
}

/**
 * Whether a failed request should rotate to the next account/connection,
 * honoring the user's fallback policy in addition to the built-in decision.
 *
 * @param {boolean} builtinShouldFallback - decision from checkFallbackError()
 * @param {number} status
 * @param {object} policy - from resolveFallbackPolicy()
 */
export function applyFallbackPolicy(builtinShouldFallback, status, policy) {
  const p = policy || FALLBACK_POLICY_DEFAULTS;
  if (!p.accountFallbackEnabled) return false;
  if (builtinShouldFallback) return true;
  if (Array.isArray(p.extraFallbackStatuses) && p.extraFallbackStatuses.includes(Number(status))) {
    return true;
  }
  return false;
}
