import { describe, expect, it, vi, afterEach } from "vitest";
import { createFlowController, mergeFlowConfig, withFlowControl } from "../../src/lib/flowControl/engine.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("mergeFlowConfig", () => {
  it("fills defaults", () => {
    const c = mergeFlowConfig({ enabled: true });
    expect(c.maxConcurrent).toBe(0);
    expect(c.rpm).toBe(0);
    expect(c.queueTimeoutMs).toBe(30000);
    expect(c.maxQueue).toBe(200);
  });
});

describe("flow controller — max concurrent", () => {
  it("allows up to maxConcurrent and queues the rest", async () => {
    vi.useFakeTimers();
    const fc = createFlowController();
    const cfg = { enabled: true, maxConcurrent: 1, rpm: 0, queueTimeoutMs: 60000, maxQueue: 10 };

    const first = await fc.acquire("p", cfg);
    expect(first.ok).toBe(true);

    let secondResolved = null;
    fc.acquire("p", cfg).then((r) => { secondResolved = r; });
    await Promise.resolve();
    expect(secondResolved).toBeNull(); // still queued

    fc.release("p", cfg);
    await Promise.resolve();
    await Promise.resolve();
    expect(secondResolved?.ok).toBe(true);
  });

  it("rejects when the queue is full", async () => {
    vi.useFakeTimers();
    const fc = createFlowController();
    const cfg = { enabled: true, maxConcurrent: 1, rpm: 0, queueTimeoutMs: 60000, maxQueue: 1 };

    await fc.acquire("p", cfg);          // takes the single concurrent slot
    fc.acquire("p", cfg);                // fills the queue
    const third = await fc.acquire("p", cfg);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("queue_full");
  });

  it("rejects a waiter that exceeds queueTimeoutMs", async () => {
    vi.useFakeTimers();
    const fc = createFlowController();
    const cfg = { enabled: true, maxConcurrent: 1, rpm: 0, queueTimeoutMs: 5000, maxQueue: 10 };

    await fc.acquire("p", cfg);
    const p = fc.acquire("p", cfg);
    vi.advanceTimersByTime(5001);
    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("timeout");
  });
});

describe("flow controller — rpm window", () => {
  it("blocks past the rpm cap and lets the window roll over", async () => {
    let t = 1000;
    const fc = createFlowController({ now: () => t });
    const cfg = { enabled: true, maxConcurrent: 0, rpm: 2, queueTimeoutMs: 600000, maxQueue: 10 };

    expect((await fc.acquire("p", cfg)).ok).toBe(true);
    expect((await fc.acquire("p", cfg)).ok).toBe(true);

    // Third is queued; not resolved until the window slides.
    let third = null;
    fc.acquire("p", cfg).then((r) => { third = r; });
    await Promise.resolve();
    expect(third).toBeNull();

    // Advance beyond the minute window; the queued request should now proceed.
    t += 60_001;
    fc.release("p", cfg); // trigger pump
    await Promise.resolve();
    await Promise.resolve();
    expect(third?.ok).toBe(true);
  });

  it("reports live status", async () => {
    const fc = createFlowController({ now: () => 5000 });
    const cfg = { enabled: true, maxConcurrent: 3, rpm: 10 };
    await fc.acquire("p", cfg);
    const s = fc.status("p", cfg);
    expect(s.active).toBe(1);
    expect(s.rpmUsed).toBe(1);
    expect(s.rpmRemaining).toBe(9);
  });
});

describe("withFlowControl wrapper", () => {
  it("runs fn directly when disabled", async () => {
    const fn = vi.fn(async () => "ok");
    const out = await withFlowControl("p", { enabled: false }, fn);
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("releases the slot even when fn throws", async () => {
    const fc = createFlowController();
    global._flowController = fc;
    const cfg = { enabled: true, maxConcurrent: 1, rpm: 0, queueTimeoutMs: 1000, maxQueue: 5 };
    await expect(withFlowControl("p", cfg, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // Slot released → status active back to 0.
    expect(fc.status("p", cfg).active).toBe(0);
  });

  it("throws a typed error when the queue is full", async () => {
    const fc = createFlowController();
    global._flowController = fc;
    const cfg = { enabled: true, maxConcurrent: 1, rpm: 0, queueTimeoutMs: 60000, maxQueue: 1 };
    // Occupy the single slot with a long-running call.
    let resolveHold;
    const hold = withFlowControl("p", cfg, () => new Promise((r) => { resolveHold = r; }));
    await Promise.resolve();
    // Second request fills the queue (waiter), third is rejected immediately.
    const queued = withFlowControl("p", cfg, async () => "queued");
    await Promise.resolve();
    await expect(withFlowControl("p", cfg, async () => "x")).rejects.toMatchObject({ code: "UPSTREAM_QUEUE_FULL" });
    resolveHold("done");
    await hold;
    await queued;
  });
});
