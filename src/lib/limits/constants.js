// Per-provider rate limit & budget configuration constants.
// All limits are optional and fail-open: an unset field disables that check.

// Window sizes (ms)
export const WINDOW_MS = {
  minute: 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

// Defaults applied when a provider entry omits a field.
export const LIMIT_DEFAULTS = {
  enabled: false,       // master switch per provider
  rpm: 0,               // requests per minute (0 = unlimited)
  tpm: 0,               // tokens per minute (0 = unlimited)
  dailyRequests: 0,     // requests per rolling day (0 = unlimited)
  dailyTokens: 0,       // tokens per rolling day (0 = unlimited)
  dailyCost: 0,         // estimated USD cost per rolling day (0 = unlimited)
  monthlyCost: 0,       // estimated USD cost per rolling month (0 = unlimited)
  // When true, a breach returns 429 instead of only logging a warning.
  enforce: true,
};

// Cooldown applied to the provider (account-level) when a limit is enforced,
// so a burst of requests after a breach does not hammer the upstream.
export const LIMIT_BREACH_COOLDOWN_MS = 60 * 1000;

// Human-readable labels for diagnostics + API responses.
export const LIMIT_KINDS = {
  rpm: "requests per minute",
  tpm: "tokens per minute",
  dailyRequests: "requests per day",
  dailyTokens: "tokens per day",
  dailyCost: "daily cost budget",
  monthlyCost: "monthly cost budget",
};

export function mergeLimitConfig(entry) {
  return { ...LIMIT_DEFAULTS, ...(entry || {}) };
}
