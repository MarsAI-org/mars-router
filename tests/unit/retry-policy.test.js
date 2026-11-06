import { describe, expect, it } from "vitest";
import {
  resolveRetryConfig,
  resolveFallbackPolicy,
  applyFallbackPolicy,
  FALLBACK_POLICY_DEFAULTS,
} from "../../open-sse/config/retryPolicy.js";
import { DEFAULT_RETRY_CONFIG, resolveRetryEntry } from "../../open-sse/config/runtimeConfig.js";

describe("resolveRetryConfig", () => {
  it("returns defaults when settings are absent", () => {
    const cfg = resolveRetryConfig("openai", null, null);
    expect(resolveRetryEntry(cfg[502])).toEqual(resolveRetryEntry(DEFAULT_RETRY_CONFIG[502]));
  });

  it("returns defaults when the retry policy is disabled", () => {
    const cfg = resolveRetryConfig("openai", null, { retryPolicy: { enabled: false, default: { 502: 9 } } });
    expect(resolveRetryEntry(cfg[502]).attempts).toBe(resolveRetryEntry(DEFAULT_RETRY_CONFIG[502]).attempts);
  });

  it("applies global status overrides when enabled", () => {
    const settings = { retryPolicy: { enabled: true, default: { 502: { attempts: 5, delayMs: 100 } } } };
    const cfg = resolveRetryConfig("openai", null, settings);
    expect(resolveRetryEntry(cfg[502])).toEqual({ attempts: 5, delayMs: 100 });
  });

  it("accepts a bare number as attempts and keeps the base delay", () => {
    const settings = { retryPolicy: { enabled: true, default: { 503: 7 } } };
    const cfg = resolveRetryConfig("openai", null, settings);
    expect(resolveRetryEntry(cfg[503]).attempts).toBe(7);
    expect(resolveRetryEntry(cfg[503]).delayMs).toBe(resolveRetryEntry(DEFAULT_RETRY_CONFIG[503]).delayMs);
  });

  it("lets a per-provider override win over the global override", () => {
    const settings = {
      retryPolicy: {
        enabled: true,
        default: { 502: { attempts: 2, delayMs: 100 } },
        byProvider: { claude: { 502: { attempts: 9, delayMs: 50 } } },
      },
    };
    expect(resolveRetryEntry(resolveRetryConfig("claude", null, settings)[502]).attempts).toBe(9);
    expect(resolveRetryEntry(resolveRetryConfig("openai", null, settings)[502]).attempts).toBe(2);
  });

  it("layers on top of a provider's own registry retry config", () => {
    const base = { 429: { attempts: 4, delayMs: 1000 } };
    const settings = { retryPolicy: { enabled: true, default: { 429: { attempts: 1 } } } };
    const cfg = resolveRetryConfig("claude", base, settings);
    expect(resolveRetryEntry(cfg[429])).toEqual({ attempts: 1, delayMs: 1000 });
  });
});

describe("fallback policy", () => {
  it("defaults to enabled account fallback", () => {
    expect(resolveFallbackPolicy(null)).toEqual(FALLBACK_POLICY_DEFAULTS);
  });

  it("disables rotation when accountFallbackEnabled is false", () => {
    const policy = resolveFallbackPolicy({ fallbackPolicy: { accountFallbackEnabled: false } });
    expect(applyFallbackPolicy(true, 500, policy)).toBe(false);
  });

  it("widens rotation with extraFallbackStatuses", () => {
    const policy = resolveFallbackPolicy({ fallbackPolicy: { extraFallbackStatuses: [418] } });
    expect(applyFallbackPolicy(false, 418, policy)).toBe(true);
    expect(applyFallbackPolicy(false, 404, policy)).toBe(false);
  });

  it("keeps the built-in decision when enabled", () => {
    const policy = resolveFallbackPolicy({});
    expect(applyFallbackPolicy(true, 429, policy)).toBe(true);
    expect(applyFallbackPolicy(false, 429, policy)).toBe(false);
  });
});
