import { describe, expect, it } from "vitest";
import {
  sanitizeProviderLimits,
  sanitizeRetryPolicy,
  sanitizeFallbackPolicy,
  sanitizeAbuseMonitoring,
  sanitizePromptInjections,
  sanitizeModelCatalog,
  sanitizeUptimeMonitor,
  sanitizeUpstreamLimits,
  toNonNegativeNumber,
} from "../../src/lib/settingsSanitizers.js";

describe("sanitizeProviderLimits", () => {
  it("returns {} for non-objects", () => {
    expect(sanitizeProviderLimits(null)).toEqual({});
    expect(sanitizeProviderLimits([])).toEqual({});
    expect(sanitizeProviderLimits("x")).toEqual({});
  });

  it("coerces numbers and drops garbage", () => {
    const out = sanitizeProviderLimits({
      claude: { enabled: true, rpm: "60", tpm: -5, dailyCost: "abc", enforce: false },
    });
    expect(out.claude).toEqual({
      enabled: true,
      enforce: false,
      rpm: 60,
      tpm: 0,
      dailyRequests: 0,
      dailyTokens: 0,
      dailyCost: 0,
      monthlyCost: 0,
    });
  });

  it("defaults enforce to true and enabled to false", () => {
    const out = sanitizeProviderLimits({ openai: { rpm: 1 } });
    expect(out.openai.enabled).toBe(false);
    expect(out.openai.enforce).toBe(true);
  });

  it("skips non-object entries", () => {
    expect(sanitizeProviderLimits({ bad: 5, good: { rpm: 1 } })).toEqual({
      good: expect.objectContaining({ rpm: 1 }),
    });
  });
});

describe("sanitizeRetryPolicy", () => {
  it("returns disabled for non-objects", () => {
    expect(sanitizeRetryPolicy(null)).toEqual({ enabled: false });
  });

  it("keeps only numeric statuses and valid entries", () => {
    const out = sanitizeRetryPolicy({
      enabled: true,
      default: { 502: { attempts: 4, delayMs: 100 }, foo: 1, 503: 3, 504: { attempts: -2 } },
    });
    expect(out.enabled).toBe(true);
    expect(out.default[502]).toEqual({ attempts: 4, delayMs: 100 });
    expect(out.default[503]).toEqual({ attempts: 3 });
    expect(out.default[504]).toEqual({ attempts: 0 });
    expect(out.default.foo).toBeUndefined();
  });

  it("sanitizes byProvider", () => {
    const out = sanitizeRetryPolicy({
      enabled: true,
      byProvider: { claude: { 429: { attempts: 1, delayMs: 0 } }, bad: [] },
    });
    expect(out.byProvider.claude[429]).toEqual({ attempts: 1, delayMs: 0 });
    expect(out.byProvider.bad).toBeUndefined();
  });
});

describe("sanitizeFallbackPolicy", () => {
  it("filters invalid status codes and dedupes", () => {
    const out = sanitizeFallbackPolicy({ extraFallbackStatuses: [500, 500, 99, 600, "502", "x"] });
    expect(out.extraFallbackStatuses).toEqual([500, 502]);
  });

  it("coerces booleans", () => {
    expect(sanitizeFallbackPolicy({ accountFallbackEnabled: 0 })).toEqual({ accountFallbackEnabled: false });
  });

  it("returns {} for garbage", () => {
    expect(sanitizeFallbackPolicy(null)).toEqual({});
  });
});

describe("toNonNegativeNumber", () => {
  it("clamps negatives and NaN to 0", () => {
    expect(toNonNegativeNumber(-1)).toBe(0);
    expect(toNonNegativeNumber("abc")).toBe(0);
    expect(toNonNegativeNumber("12")).toBe(12);
  });
});

describe("sanitizeAbuseMonitoring", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeAbuseMonitoring(null)).toEqual({
      enabled: false, rpmThreshold: 300, multiIpThreshold: 5, errorBurstThreshold: 20,
    });
  });

  it("coerces enabled and thresholds", () => {
    const out = sanitizeAbuseMonitoring({ enabled: true, rpmThreshold: "50", multiIpThreshold: -3 });
    expect(out.enabled).toBe(true);
    expect(out.rpmThreshold).toBe(50);
    expect(out.multiIpThreshold).toBe(0);
    expect(out.errorBurstThreshold).toBe(20);
  });
});

describe("sanitizePromptInjections", () => {
  it("returns [] for non-arrays", () => {
    expect(sanitizePromptInjections(null)).toEqual([]);
    expect(sanitizePromptInjections({})).toEqual([]);
  });

  it("drops empty-text and combo-scoped entries without a target", () => {
    const out = sanitizePromptInjections([
      { text: "  " },
      { text: "ok", scope: "combo", comboName: "" },
      { text: "ok2", scope: "combo", comboName: "Coding" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("ok2");
    expect(out[0].comboName).toBe("Coding");
  });

  it("defaults scope/position and coerces enabled", () => {
    const [e] = sanitizePromptInjections([{ text: "x" }]);
    expect(e.scope).toBe("global");
    expect(e.position).toBe("append");
    expect(e.enabled).toBe(false);
  });

  it("caps the text length", () => {
    const big = "a".repeat(50000);
    const [e] = sanitizePromptInjections([{ text: big }]);
    expect(e.text.length).toBe(20000);
  });
});

describe("sanitizeModelCatalog", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeModelCatalog(null)).toEqual({ hidden: [], displayNames: {}, order: [] });
  });

  it("trims and de-dupes", () => {
    const c = sanitizeModelCatalog({ hidden: [" a ", "a"], order: ["x", "x"], displayNames: { " cc/m ": "N", bad: 1 } });
    expect(c.hidden).toEqual(["a"]);
    expect(c.order).toEqual(["x"]);
    expect(c.displayNames).toEqual({ "cc/m": "N" });
  });
});

describe("sanitizeUptimeMonitor", () => {
  it("returns defaults for garbage", () => {
    expect(sanitizeUptimeMonitor(null)).toEqual({
      enabled: false, intervalMinutes: 30, kinds: ["llm"], concurrency: 6, retentionDays: 30,
    });
  });

  it("clamps concurrency and coerces fields", () => {
    const out = sanitizeUptimeMonitor({ enabled: true, intervalMinutes: "15", concurrency: 99, kinds: ["llm", "llm", "image"] });
    expect(out.enabled).toBe(true);
    expect(out.intervalMinutes).toBe(15);
    expect(out.concurrency).toBe(20);
    expect(out.kinds).toEqual(["llm", "image"]);
  });
});

describe("sanitizeUpstreamLimits", () => {
  it("returns {} for garbage", () => {
    expect(sanitizeUpstreamLimits(null)).toEqual({});
    expect(sanitizeUpstreamLimits([])).toEqual({});
  });

  it("coerces fields and applies defaults", () => {
    const out = sanitizeUpstreamLimits({ openai: { enabled: true, maxConcurrent: "5", rpm: -3 } });
    expect(out.openai).toEqual({
      enabled: true, maxConcurrent: 5, rpm: 0, queueTimeoutMs: 30000, maxQueue: 200,
    });
  });

  it("skips malformed entries", () => {
    expect(sanitizeUpstreamLimits({ bad: 5, good: { enabled: true } })).toEqual({
      good: expect.objectContaining({ enabled: true }),
    });
  });
});
