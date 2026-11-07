// Per-provider upstream flow control for reselling.
//
// Enforces the upstream's OWN limits (max concurrent + RPM) globally per
// provider so the total outbound traffic never exceeds what the upstream
// allows. Excess requests QUEUE (FIFO) instead of failing, up to a bounded
// queue size and wait timeout; only a request that waits longer than the
// timeout is rejected, with a Retry-After hint.
//
// The engine is pure and clock-injectable so it is unit-testable without real
// timers. A separate manager owns the live per-provider state.

export const FLOW_DEFAULTS = {
  enabled: false,
  maxConcurrent: 0,   // 0 = unlimited
  rpm: 0,             // 0 = unlimited
  queueTimeoutMs: 30000,
  maxQueue: 200,      // 0 = unlimited queue length
};

export function mergeFlowConfig(entry) {
  return { ...FLOW_DEFAULTS, ...(entry || {}) };
}

const MINUTE_MS = 60 * 1000;

/**
 * Create a per-provider flow controller.
 * @param {object} [opts]
 * @param {() => number} [opts.now] injectable clock (ms)
 */
export function createFlowController({ now = Date.now } = {}) {
  // provider -> state
  const states = new Map();

  function stateFor(provider) {
    let s = states.get(provider);
    if (!s) {
      s = {
        active: 0,          // in-flight upstream requests
        started: [],        // timestamps of request starts (rolling minute)
        queue: [],          // pending waiters (FIFO)
        pumping: false,
      };
      states.set(provider, s);
    }
    return s;
  }

  function pruneMinute(s, t) {
    const cutoff = t - MINUTE_MS;
    let i = 0;
    while (i < s.started.length && s.started[i] < cutoff) i++;
    if (i > 0) s.started = s.started.slice(i);
  }

  function minuteCount(s, t) {
    pruneMinute(s, t);
    return s.started.length;
  }

  /** Can one more request start now, given the config? */
  function canStart(s, cfg, t) {
    if (Number(cfg.maxConcurrent) > 0 && s.active >= Number(cfg.maxConcurrent)) return false;
    if (Number(cfg.rpm) > 0 && minuteCount(s, t) >= Number(cfg.rpm)) return false;
    return true;
  }

  /** How long until a slot is likely free (ms), or 0 if free now. */
  function estimateWaitMs(s, cfg, t) {
    if (Number(cfg.maxConcurrent) > 0 && s.active >= Number(cfg.maxConcurrent)) {
      return 250; // a running request will free a slot; caller retries
    }
    if (Number(cfg.rpm) > 0 && minuteCount(s, t) >= Number(cfg.rpm)) {
      // Wait until the oldest start falls out of the window.
      const oldest = s.started[0] ?? t;
      return Math.max(50, oldest + MINUTE_MS - t);
    }
    return 0;
  }

  function pump(provider, cfg) {
    const s = stateFor(provider);
    if (s.pumping) return;
    s.pumping = true;
    try {
      while (s.queue.length > 0) {
        const t = now();
        if (!canStart(s, cfg, t)) break;
        const waiter = s.queue.shift();
        clearTimeout(waiter.timer);
        s.active += 1;
        s.started.push(t);
        pruneMinute(s, t);
        waiter.resolve({ ok: true, immediate: false });
      }
    } finally {
      s.pumping = false;
    }
  }

  /**
   * Acquire a slot before calling the upstream.
   * @returns {Promise<{ ok: boolean, reason?: string, waitMs?: number }>}
   */
  function acquire(provider, rawCfg) {
    const cfg = mergeFlowConfig(rawCfg);
    if (!cfg.enabled || (Number(cfg.maxConcurrent) === 0 && Number(cfg.rpm) === 0)) {
      return Promise.resolve({ ok: true, immediate: true });
    }
    const s = stateFor(provider);
    const t = now();
    if (s.queue.length === 0 && canStart(s, cfg, t)) {
      s.active += 1;
      s.started.push(t);
      pruneMinute(s, t);
      return Promise.resolve({ ok: true, immediate: true });
    }

    if (Number(cfg.maxQueue) > 0 && s.queue.length >= Number(cfg.maxQueue)) {
      return Promise.resolve({
        ok: false,
        reason: "queue_full",
        waitMs: Math.max(250, estimateWaitMs(s, cfg, t)),
      });
    }

    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const idx = s.queue.indexOf(waiter);
        if (idx >= 0) s.queue.splice(idx, 1);
        resolve({
          ok: false,
          reason: "timeout",
          waitMs: Math.max(1000, estimateWaitMs(s, cfg, now())),
        });
      }, Math.max(0, Number(cfg.queueTimeoutMs) || FLOW_DEFAULTS.queueTimeoutMs));
      // Do not keep the process alive just for a queued waiter.
      waiter.timer?.unref?.();
      s.queue.push(waiter);
      pump(provider, cfg);
    });
  }

  /** Release a slot after the upstream call settles. */
  function release(provider, rawCfg) {
    const cfg = mergeFlowConfig(rawCfg);
    const s = stateFor(provider);
    if (s.active > 0) s.active -= 1;
    if (cfg.enabled) pump(provider, cfg);
  }

  /** Live status for the dashboard. */
  function status(provider, rawCfg) {
    const cfg = mergeFlowConfig(rawCfg);
    const s = stateFor(provider);
    const t = now();
    return {
      enabled: cfg.enabled,
      maxConcurrent: Number(cfg.maxConcurrent) || 0,
      rpm: Number(cfg.rpm) || 0,
      active: s.active,
      queued: s.queue.length,
      rpmUsed: minuteCount(s, t),
      rpmRemaining: Number(cfg.rpm) > 0 ? Math.max(0, Number(cfg.rpm) - minuteCount(s, t)) : null,
    };
  }

  /** For tests / manual reset. */
  function reset() {
    for (const s of states.values()) {
      for (const w of s.queue) clearTimeout(w.timer);
      s.queue = [];
      s.active = 0;
      s.started = [];
    }
    states.clear();
  }

  return { acquire, release, status, reset, _states: states };
}

// Process-wide controller (shared across Next.js modules).
export function getFlowController() {
  if (!global._flowController) global._flowController = createFlowController();
  return global._flowController;
}

/**
 * Acquire a flow-control slot and return a one-shot release() plus the gate
 * result. Idempotent release: calling it twice is a no-op.
 * Fail-open: on any internal error, returns ok with a no-op release so the
 * request still runs.
 * @param {string} provider
 * @param {object} rawCfg
 * @returns {Promise<{ ok: boolean, reason?: string, waitMs?: number, release: () => void }>}
 */
export async function acquireFlow(provider, rawCfg) {
  const cfg = mergeFlowConfig(rawCfg);
  if (!cfg.enabled || (Number(cfg.maxConcurrent) === 0 && Number(cfg.rpm) === 0)) {
    return { ok: true, release: () => {} };
  }
  const controller = getFlowController();
  let gate;
  try {
    gate = await controller.acquire(provider, cfg);
  } catch {
    return { ok: true, release: () => {} }; // fail-open
  }
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, waitMs: gate.waitMs, release: () => {} };
  }
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      try { controller.release(provider, cfg); } catch { /* fail-open */ }
    },
  };
}

/**
 * Wrap an async upstream call with flow control, releasing when `fn` settles.
 * Prefer `acquireFlow` when the work outlives this function (e.g. streaming,
 * where the response body is consumed after the call returns).
 * @template T
 * @param {string} provider
 * @param {object} rawCfg
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withFlowControl(provider, rawCfg, fn) {
  const gate = await acquireFlow(provider, rawCfg);
  if (!gate.ok) {
    const err = new Error(
      gate.reason === "queue_full"
        ? `Upstream ${provider} is at capacity (queue full). Try again shortly.`
        : `Upstream ${provider} is busy; request timed out waiting for a slot.`
    );
    err.code = gate.reason === "queue_full" ? "UPSTREAM_QUEUE_FULL" : "UPSTREAM_QUEUE_TIMEOUT";
    err.retryAfterMs = gate.waitMs;
    throw err;
  }
  try {
    return await fn();
  } finally {
    gate.release();
  }
}
