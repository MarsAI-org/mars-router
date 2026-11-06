import { describe, expect, it, beforeEach } from "vitest";
import {
  checkProviderLimits,
  recordProviderUsage,
  getRollingUsage,
  buildLimitBreach,
  resetProviderLimitState,
} from "../../src/lib/limits/engine.js";
import { mergeLimitConfig, LIMIT_DEFAULTS } from "../../src/lib/limits/constants.js";

const PROVIDER = "test-provider";

describe("provider limits engine", () => {
  beforeEach(() => {
    resetProviderLimitState();
  });

  it("allows everything when the provider entry is disabled", () => {
    const result = checkProviderLimits(PROVIDER, { enabled: false, rpm: 1 });
    expect(result.allowed).toBe(true);
  });

  it("allows everything when the provider entry is missing", () => {
    const result = checkProviderLimits(PROVIDER, null);
    expect(result.allowed).toBe(true);
  });

  it("breaches rpm once the rolling minute count reaches the cap", () => {
    const limit = { enabled: true, rpm: 2 };
    recordProviderUsage(PROVIDER, { tokens: 10 });
    recordProviderUsage(PROVIDER, { tokens: 10 });
    const result = checkProviderLimits(PROVIDER, limit);
    expect(result.allowed).toBe(false);
    expect(result.breachedKind).toBe("rpm");
    expect(result.limit).toBe(2);
  });

  it("accumulates token usage within the minute for tpm", () => {
    const limit = { enabled: true, tpm: 100 };
    recordProviderUsage(PROVIDER, { tokens: 60 });
    expect(checkProviderLimits(PROVIDER, limit).allowed).toBe(true);
    recordProviderUsage(PROVIDER, { tokens: 50 });
    const result = checkProviderLimits(PROVIDER, limit);
    expect(result.allowed).toBe(false);
    expect(result.breachedKind).toBe("tpm");
  });

  it("counts daily requests and tokens", () => {
    const limit = { enabled: true, dailyRequests: 1, dailyTokens: 0 };
    recordProviderUsage(PROVIDER, { tokens: 5 });
    expect(checkProviderLimits(PROVIDER, limit).allowed).toBe(false);

    resetProviderLimitState();
    const tokenLimit = { enabled: true, dailyTokens: 100 };
    recordProviderUsage(PROVIDER, { tokens: 120 });
    expect(checkProviderLimits(PROVIDER, tokenLimit).breachedKind).toBe("dailyTokens");
  });

  it("tracks daily and monthly cost budgets", () => {
    recordProviderUsage(PROVIDER, { tokens: 1, cost: 3 });
    expect(checkProviderLimits(PROVIDER, { enabled: true, dailyCost: 2 }).breachedKind).toBe("dailyCost");
    expect(checkProviderLimits(PROVIDER, { enabled: true, monthlyCost: 2 }).breachedKind).toBe("monthlyCost");
    expect(checkProviderLimits(PROVIDER, { enabled: true, monthlyCost: 10 }).allowed).toBe(true);
  });

  it("never throws on recordProviderUsage with bad input (fail-open)", () => {
    expect(() => recordProviderUsage(null, { tokens: "x" })).not.toThrow();
    expect(() => recordProviderUsage(PROVIDER, null)).not.toThrow();
    expect(getRollingUsage(PROVIDER).rpm).toBe(1);
  });

  it("builds a readable breach payload", () => {
    const breach = buildLimitBreach(PROVIDER, { breachedKind: "rpm", current: 5, limit: 5 });
    expect(breach.message).toContain("requests per minute");
    expect(breach.provider).toBe(PROVIDER);
  });

  it("mergeLimitConfig fills defaults", () => {
    expect(mergeLimitConfig({ enabled: true })).toEqual({ ...LIMIT_DEFAULTS, enabled: true });
    expect(mergeLimitConfig(null).enabled).toBe(false);
  });
});
