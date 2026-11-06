// Billing layer: plans, subscriptions, per-key usage and anti-abuse.
// Uses a real (temp-dir) DB so the repos + migrations are exercised.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-billing-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  delete global._keyQuotaState;
  delete global._abuseState;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

async function initDb() {
  const { initDb } = await import("@/lib/db/index.js");
  await initDb();
}

describe("plansRepo", () => {
  it("creates a plan with normalized limits and defaults", async () => {
    await initDb();
    const { createPlan, getPlanById } = await import("@/lib/db/repos/plansRepo.js");
    const plan = await createPlan("Pro", { rpm: "60", tpm: -5, priceMonthly: "9.99", rank: "2" });
    expect(plan.name).toBe("Pro");
    expect(plan.rpm).toBe(60);
    expect(plan.tpm).toBe(0);
    expect(plan.priceMonthly).toBeCloseTo(9.99);
    expect(plan.rank).toBe(2);
    expect(plan.isActive).toBe(true);
    const fetched = await getPlanById(plan.id);
    expect(fetched.name).toBe("Pro");
  });

  it("rejects duplicate names and empty names", async () => {
    await initDb();
    const { createPlan } = await import("@/lib/db/repos/plansRepo.js");
    await createPlan("Free");
    await expect(createPlan("Free")).rejects.toThrow(/already exists/i);
    await expect(createPlan("   ")).rejects.toThrow(/required/i);
  });

  it("updates and deletes plans", async () => {
    await initDb();
    const { createPlan, updatePlan, deletePlan, getPlanById } = await import("@/lib/db/repos/plansRepo.js");
    const plan = await createPlan("Biz", { monthlyTokens: 1000 });
    const updated = await updatePlan(plan.id, { monthlyTokens: 5000, isActive: false });
    expect(updated.monthlyTokens).toBe(5000);
    expect(updated.isActive).toBe(false);
    await deletePlan(plan.id);
    expect(await getPlanById(plan.id)).toBeNull();
  });
});

describe("subscriptionsRepo", () => {
  it("assigns a plan to a key and replaces it on reassign", async () => {
    await initDb();
    const { createPlan } = await import("@/lib/db/repos/plansRepo.js");
    const { setSubscription, getSubscriptionByKeyId } = await import("@/lib/db/repos/subscriptionsRepo.js");
    const p1 = await createPlan("A", { priceMonthly: 5 });
    const p2 = await createPlan("B", { priceMonthly: 10 });

    const s1 = await setSubscription("key-1", p1.id);
    expect(s1.planId).toBe(p1.id);

    const s2 = await setSubscription("key-1", p2.id);
    expect(s2.planId).toBe(p2.id);
    // one subscription per key
    const fetched = await getSubscriptionByKeyId("key-1");
    expect(fetched.id).toBe(s1.id);
    expect(fetched.planId).toBe(p2.id);
  });

  it("validates required fields", async () => {
    await initDb();
    const { setSubscription } = await import("@/lib/db/repos/subscriptionsRepo.js");
    await expect(setSubscription(null, "p")).rejects.toThrow(/keyId/);
    await expect(setSubscription("k", null)).rejects.toThrow(/planId/);
  });
});

describe("keyUsageRepo", () => {
  it("aggregates totals per key for a window", async () => {
    await initDb();
    const { recordKeyUsage, getUsageTotalsByKey, getKeyUsageForDay } = await import("@/lib/db/repos/keyUsageRepo.js");
    await recordKeyUsage("k1", { promptTokens: 10, completionTokens: 5, cost: 0.1 });
    await recordKeyUsage("k1", { promptTokens: 20, completionTokens: 5, cost: 0.2 });
    await recordKeyUsage("k2", { promptTokens: 1, completionTokens: 1, cost: 0.01 });

    const day = await getKeyUsageForDay("k1");
    expect(day.requests).toBe(2);
    expect(day.promptTokens).toBe(30);
    expect(day.completionTokens).toBe(10);

    const totals = await getUsageTotalsByKey(30);
    expect(totals.k1.requests).toBe(2);
    expect(totals.k2.requests).toBe(1);
  });
});

describe("quota engine", () => {
  it("evaluates plan limits against a usage snapshot", async () => {
    const { evaluateKeyQuota, recordKeyMinute, resetKeyQuotaState } = await import("@/lib/billing/quota.js");
    resetKeyQuotaState();
    recordKeyMinute("k1", 500);
    recordKeyMinute("k1", 600);

    const plan = { rpm: 3, tpm: 2000, dailyRequests: 0, dailyTokens: 0, monthlyRequests: 0, monthlyTokens: 0, monthlyCost: 0 };
    const usage = { rpm: 2, tpm: 1100, dayRequests: 0, dayTokens: 0, monthRequests: 0, monthTokens: 0, monthCost: 0 };
    expect(evaluateKeyQuota(plan, usage).allowed).toBe(true);

    // tpm breach
    const bad = evaluateKeyQuota(plan, { ...usage, tpm: 2500 });
    expect(bad.allowed).toBe(false);
    expect(bad.breached.kind).toBe("tpm");
  });

  it("treats 0 as unlimited", async () => {
    const { evaluateKeyQuota } = await import("@/lib/billing/quota.js");
    const plan = { rpm: 0, tpm: 0, dailyRequests: 0, dailyTokens: 0, monthlyRequests: 0, monthlyTokens: 0, monthlyCost: 0 };
    const usage = { rpm: 99999, tpm: 99999, dayRequests: 9e9, dayTokens: 9e9, monthRequests: 9e9, monthTokens: 9e9, monthCost: 9e9 };
    expect(evaluateKeyQuota(plan, usage).allowed).toBe(true);
  });
});

describe("plan resolution", () => {
  it("returns DEFAULT_PLAN when no active subscription", async () => {
    await initDb();
    const { resolveKeyPlan, planHasAnyLimit } = await import("@/lib/billing/plans.resolve.js");
    const plan = await resolveKeyPlan("no-such-key");
    expect(planHasAnyLimit(plan)).toBe(false);
  });

  it("returns the plan for an active subscription and defaults for suspended", async () => {
    await initDb();
    const { createPlan } = await import("@/lib/db/repos/plansRepo.js");
    const { setSubscription } = await import("@/lib/db/repos/subscriptionsRepo.js");
    const { resolveKeyPlan } = await import("@/lib/billing/plans.resolve.js");
    const plan = await createPlan("Pro", { rpm: 30 });

    await setSubscription("k-active", plan.id, { status: "active" });
    const active = await resolveKeyPlan("k-active");
    expect(active.rpm).toBe(30);

    await setSubscription("k-susp", plan.id, { status: "suspended" });
    const susp = await resolveKeyPlan("k-susp");
    expect(susp.rpm).toBe(0);
    expect(susp.subscription.status).toBe("suspended");
  });
});

describe("abuse monitoring", () => {
  it("records and counts events", async () => {
    await initDb();
    const { recordAbuseEvent, countRecentAbuseEvents, getAbuseEvents } = await import("@/lib/db/repos/abuseRepo.js");
    await recordAbuseEvent({ keyId: "k1", kind: "quota_breach", severity: "warn", detail: "x" });
    expect(await countRecentAbuseEvents("k1", "quota_breach")).toBe(1);
    const events = await getAbuseEvents({ keyId: "k1" });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("quota_breach");
  });

  it("ignores unknown kinds (fail-open)", async () => {
    await initDb();
    const { recordAbuseEvent } = await import("@/lib/db/repos/abuseRepo.js");
    expect(await recordAbuseEvent({ keyId: "k1", kind: "bogus" })).toBeNull();
  });

  it("trips rate_spike and multi_ip thresholds", async () => {
    await initDb();
    const { observeKeyRequest } = await import("@/lib/billing/abuse.js");
    const { getAbuseEvents } = await import("@/lib/db/repos/abuseRepo.js");
    const config = { enabled: true, rpmThreshold: 2, multiIpThreshold: 1, errorBurstThreshold: 5 };

    await observeKeyRequest("k1", { ip: "1.1.1.1", config });
    await observeKeyRequest("k1", { ip: "2.2.2.2", config });
    await observeKeyRequest("k1", { ip: "3.3.3.3", config });

    const events = await getAbuseEvents({ keyId: "k1" });
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("rate_spike");
    expect(kinds).toContain("multi_ip");
  });
});

describe("sales analytics", () => {
  it("computes MRR, margin and per-key rows", async () => {
    await initDb();
    const { createPlan } = await import("@/lib/db/repos/plansRepo.js");
    const { setSubscription } = await import("@/lib/db/repos/subscriptionsRepo.js");
    const { createApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
    const { recordKeyUsage } = await import("@/lib/db/repos/keyUsageRepo.js");
    const { buildSalesAnalytics } = await import("@/lib/billing/analytics.js");

    const plan = await createPlan("Pro", { priceMonthly: 20 });
    const key = await createApiKey("Customer A", "machine-1");
    await setSubscription(key.id, plan.id, { status: "active" });
    await recordKeyUsage(key.id, { promptTokens: 100, completionTokens: 50, cost: 2 });

    const analytics = await buildSalesAnalytics(30);
    expect(analytics.summary.mrr).toBeCloseTo(20);
    expect(analytics.summary.totalProviderCost).toBeCloseTo(2);
    expect(analytics.summary.grossMargin).toBeCloseTo(18);
    expect(analytics.rows[0].tokens).toBe(150);
    expect(analytics.plans[0].subscribers).toBe(1);
  });
});
