import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, vi } from "vitest";
import {
  summarizeUptime,
  summarizeByTarget,
  bucketByDay,
  uptimeHealthLabel,
} from "../../src/lib/uptime/engine.js";
import { mapWithConcurrency } from "../../src/lib/uptime/runner.js";

const check = (ok, latencyMs = 100, extra = {}) => ({
  ok, latencyMs, checkedAt: new Date().toISOString(), ...extra,
});

describe("summarizeUptime", () => {
  it("returns a null-safe shape for no checks", () => {
    const s = summarizeUptime([]);
    expect(s.total).toBe(0);
    expect(s.uptimePct).toBeNull();
    expect(s.latency.avg).toBeNull();
  });

  it("computes uptime percentage", () => {
    const s = summarizeUptime([check(true), check(true), check(false), check(true)]);
    expect(s.total).toBe(4);
    expect(s.up).toBe(3);
    expect(s.uptimePct).toBe(75);
  });

  it("computes latency percentiles from successful checks only", () => {
    const s = summarizeUptime([
      check(true, 100), check(true, 200), check(true, 300), check(true, 400),
      check(false, 9999), // failure latency excluded
    ]);
    expect(s.latency.min).toBe(100);
    expect(s.latency.max).toBe(400);
    expect(s.latency.avg).toBe(250);
    expect(s.latency.p95).toBe(400);
  });

  it("tracks status counts and last error", () => {
    const s = summarizeUptime([
      check(false, 1, { status: 429, error: "rate limited" }),
      check(false, 1, { status: 502, error: "bad gateway" }),
    ]);
    expect(s.byStatus["429"]).toBe(1);
    expect(s.byStatus["502"]).toBe(1);
    expect(s.lastError).toBeTruthy();
  });
});

describe("summarizeByTarget", () => {
  it("groups by target and sorts worst-first", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const checks = [
      { target: "model", targetId: "a/x", ok: true, latencyMs: 10, checkedAt: t },
      { target: "model", targetId: "b/y", ok: false, latencyMs: 0, checkedAt: t },
      { target: "model", targetId: "b/y", ok: true, latencyMs: 10, checkedAt: t },
    ];
    const out = summarizeByTarget(checks);
    expect(out[0].targetId).toBe("b/y"); // 50% uptime first
    expect(out[1].targetId).toBe("a/x");
  });
});

describe("bucketByDay", () => {
  it("buckets checks into local days with uptime + avg latency", () => {
    const now = new Date();
    const checks = [
      { ok: true, latencyMs: 100, checkedAt: now.toISOString() },
      { ok: false, latencyMs: 0, checkedAt: now.toISOString() },
    ];
    const buckets = bucketByDay(checks, 3, now);
    expect(buckets).toHaveLength(3);
    const today = buckets[buckets.length - 1];
    expect(today.checks).toBe(2);
    expect(today.up).toBe(1);
    expect(today.uptimePct).toBe(50);
    expect(today.avgLatency).toBe(100);
  });
});

describe("uptimeHealthLabel", () => {
  it("maps percentages to labels", () => {
    expect(uptimeHealthLabel(null)).toBe("unknown");
    expect(uptimeHealthLabel(99.5)).toBe("healthy");
    expect(uptimeHealthLabel(95)).toBe("degraded");
    expect(uptimeHealthLabel(50)).toBe("down");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and runs every item", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("never rejects when a worker throws", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(out[0]).toBe(1);
    expect(out[1].ok).toBe(false);
    expect(out[2]).toBe(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([]);
  });
});

// ---- uptimeRepo (real temp DB) ----
let tempDir;
const originalDataDir = process.env.DATA_DIR;

describe("uptimeRepo", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mars-router-uptime-"));
    process.env.DATA_DIR = tempDir;
    delete global._dbAdapter;
    vi.resetModules();
  });

  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("records, lists and summarizes checks", async () => {
    const { initDb } = await import("@/lib/db/index.js");
    await initDb();
    const { recordUptimeChecks, getUptimeHistory, getUptimeTargets } = await import("@/lib/db/repos/uptimeRepo.js");
    await recordUptimeChecks([
      { target: "model", targetId: "cc/x", ok: true, latencyMs: 120 },
      { target: "model", targetId: "cc/x", ok: false, latencyMs: 0, status: 429, error: "rate limited" },
    ]);
    const hist = await getUptimeHistory({ targetId: "cc/x", days: 1 });
    expect(hist).toHaveLength(2);
    const s = summarizeUptime(hist);
    expect(s.uptimePct).toBe(50);

    const targets = await getUptimeTargets(7);
    expect(targets.find((t) => t.targetId === "cc/x")?.checks).toBe(2);
  });

  it("prunes old checks and clears", async () => {
    const { initDb } = await import("@/lib/db/index.js");
    await initDb();
    const { recordUptimeChecks, pruneUptimeChecks, clearUptimeChecks, getUptimeHistory } = await import("@/lib/db/repos/uptimeRepo.js");
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    await recordUptimeChecks([{ target: "model", targetId: "cc/x", ok: true, latencyMs: 5, checkedAt: old }]);
    const removed = await pruneUptimeChecks(30);
    expect(removed).toBe(1);
    expect(await getUptimeHistory({ days: 90 })).toHaveLength(0);
    await clearUptimeChecks();
  });
});
