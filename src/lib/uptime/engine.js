// Uptime aggregation: turn raw probe history into uptime %, latency
// percentiles, error breakdown and time buckets. Pure (no DB, no request
// objects) so it is trivially unit-testable.

/**
 * @param {Array<{ok:boolean, latencyMs:number, status?:number, error?:string, checkedAt:string}>} checks
 */
export function summarizeUptime(checks) {
  const list = Array.isArray(checks) ? checks : [];
  const total = list.length;
  if (total === 0) {
    return {
      total: 0, up: 0, down: 0, uptimePct: null,
      latency: { min: null, max: null, avg: null, p50: null, p95: null },
      lastCheck: null, lastError: null, byStatus: {},
    };
  }

  let up = 0;
  const latencies = [];
  const byStatus = {};
  let lastCheck = null;
  let lastError = null;

  for (const c of list) {
    if (c?.ok) up++;
    const lat = Number(c?.latencyMs);
    if (Number.isFinite(lat) && lat > 0 && c?.ok) latencies.push(lat);
    if (c?.status != null) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (c?.checkedAt && (!lastCheck || c.checkedAt > lastCheck)) lastCheck = c.checkedAt;
    if (!c?.ok && c?.error) lastError = c.error;
  }

  latencies.sort((a, b) => a - b);
  const percentile = (p) => {
    if (latencies.length === 0) return null;
    const idx = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
    return latencies[idx];
  };
  const sum = latencies.reduce((s, v) => s + v, 0);

  return {
    total,
    up,
    down: total - up,
    uptimePct: total ? Number(((up / total) * 100).toFixed(2)) : null,
    latency: {
      min: latencies.length ? latencies[0] : null,
      max: latencies.length ? latencies[latencies.length - 1] : null,
      avg: latencies.length ? Math.round(sum / latencies.length) : null,
      p50: percentile(50),
      p95: percentile(95),
    },
    lastCheck,
    lastError,
    byStatus,
  };
}

/**
 * Aggregate a list of checks per target.
 * @returns {Array<{ target, targetId, provider, summary }>}
 */
export function summarizeByTarget(checks) {
  const groups = new Map();
  for (const c of Array.isArray(checks) ? checks : []) {
    const key = `${c.target}::${c.targetId}`;
    if (!groups.has(key)) groups.set(key, { target: c.target, targetId: c.targetId, provider: c.provider || null, checks: [] });
    groups.get(key).checks.push(c);
  }
  return [...groups.values()].map((g) => ({
    target: g.target,
    targetId: g.targetId,
    provider: g.provider,
    summary: summarizeUptime(g.checks),
  })).sort((a, b) => {
    const ua = a.summary.uptimePct ?? 101;
    const ub = b.summary.uptimePct ?? 101;
    return ua - ub; // worst first
  });
}

/**
 * Bucket checks by local day → { dateKey, total, up, uptimePct, avgLatency }.
 * Ascending by day. Used for the uptime sparkline.
 */
export function bucketByDay(checks, days = 7, now = new Date()) {
  const map = new Map();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    keys.push(k);
    map.set(k, { requests: 0, up: 0, latSum: 0, latN: 0 });
  }
  for (const c of Array.isArray(checks) ? checks : []) {
    const ts = c?.checkedAt ? new Date(c.checkedAt) : null;
    if (!ts || Number.isNaN(ts.getTime())) continue;
    const k = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`;
    const b = map.get(k);
    if (!b) continue;
    b.requests++;
    if (c.ok) {
      b.up++;
      const lat = Number(c.latencyMs);
      if (Number.isFinite(lat) && lat > 0) { b.latSum += lat; b.latN++; }
    }
  }
  return keys.map((dateKey) => {
    const b = map.get(dateKey);
    return {
      dateKey,
      checks: b.requests,
      up: b.up,
      uptimePct: b.requests ? Number(((b.up / b.requests) * 100).toFixed(2)) : null,
      avgLatency: b.latN ? Math.round(b.latSum / b.latN) : null,
    };
  });
}

export function uptimeHealthLabel(uptimePct) {
  if (uptimePct == null) return "unknown";
  if (uptimePct >= 99) return "healthy";
  if (uptimePct >= 90) return "degraded";
  return "down";
}
