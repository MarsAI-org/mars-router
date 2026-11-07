// Ready-made presets so the dashboard menus (Provider Limits, Billing, Flow
// Control) can be configured in one click. Values are intentionally generous;
// 0 means unlimited everywhere. TPM defaults are large because a single coding
// request can burn tens of thousands of tokens, so a low TPM throttles normal
// traffic.
//
// Keep this the single source of truth for both the UI (quick presets) and any
// server-side defaults, so they never drift.

export const TPM_SCALE = {
  none: 0,
  small: 100_000,        // 100k tokens/min
  medium: 1_000_000,     // 1M tokens/min
  large: 5_000_000,      // 5M tokens/min
  xlarge: 20_000_000,    // 20M tokens/min
  unlimited: 0,
};

// Optional TPM quick-pick values shown in the UI (0 = unlimited is added
// separately). Ascending.
export const TPM_PRESETS = [
  0, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 20_000_000,
];

// Provider/budget limit presets. Every field is a number (0 = unlimited).
export const LIMIT_PRESETS = {
  unlimited: {
    label: "Unlimited",
    description: "No caps (monitor only).",
    values: { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0, dailyCost: 0, monthlyCost: 0 },
  },
  relaxed: {
    label: "Relaxed",
    description: "High ceilings; only stop runaway loops.",
    values: { rpm: 600, tpm: 5_000_000, dailyRequests: 0, dailyTokens: 0, dailyCost: 0, monthlyCost: 0 },
  },
  balanced: {
    label: "Balanced",
    description: "Comfortable for a single heavy user.",
    values: { rpm: 120, tpm: 1_000_000, dailyRequests: 5_000, dailyTokens: 50_000_000, dailyCost: 25, monthlyCost: 300 },
  },
  strict: {
    label: "Strict",
    description: "Shared/team use with a hard budget.",
    values: { rpm: 30, tpm: 250_000, dailyRequests: 1_000, dailyTokens: 10_000_000, dailyCost: 5, monthlyCost: 50 },
  },
};

// Upstream flow-control presets (enforce the upstream's own limits).
export const FLOW_PRESETS = {
  conservative: {
    label: "Conservative",
    description: "Small concurrency + low RPM (safe for tight upstream limits).",
    values: { maxConcurrent: 2, rpm: 30, queueTimeoutMs: 60000, maxQueue: 200 },
  },
  balanced: {
    label: "Balanced",
    description: "Moderate concurrency + generous TPM-friendly RPM.",
    values: { maxConcurrent: 5, rpm: 120, queueTimeoutMs: 30000, maxQueue: 500 },
  },
  aggressive: {
    label: "Aggressive",
    description: "High concurrency + high RPM (when the upstream allows it).",
    values: { maxConcurrent: 20, rpm: 600, queueTimeoutMs: 20000, maxQueue: 1000 },
  },
  unlimited: {
    label: "Unlimited",
    description: "No flow control (no queueing).",
    values: { maxConcurrent: 0, rpm: 0, queueTimeoutMs: 30000, maxQueue: 200 },
  },
};

// A generous default TPM so configuring a provider/plan does not silently
// throttle normal use. Applied by the UI when the user clicks "Use large TPM".
export const DEFAULT_TPS = TPM_SCALE.xlarge;
