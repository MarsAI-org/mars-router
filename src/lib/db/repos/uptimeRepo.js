import { getAdapter } from "../driver.js";

// Uptime probe history. Fail-open writers: a monitoring failure must never
// break the request that triggered it.

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Record one probe result. */
export async function recordUptimeCheck({ target, targetId, provider = null, ok, latencyMs = 0, status = null, error = null, checkedAt = null }) {
  try {
    if (!target || !targetId) return null;
    const db = await getAdapter();
    const ts = checkedAt || new Date().toISOString();
    db.run(
      `INSERT INTO uptimeChecks(target, targetId, provider, ok, latencyMs, status, error, checkedAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      [target, targetId, provider, ok ? 1 : 0, Math.max(0, Math.floor(Number(latencyMs) || 0)), status, error ? String(error).slice(0, 500) : null, ts]
    );
    return ts;
  } catch {
    return null;
  }
}

/** Record many probe results in one transaction. */
export async function recordUptimeChecks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  try {
    const db = await getAdapter();
    let n = 0;
    db.transaction(() => {
      for (const r of rows) {
        if (!r?.target || !r?.targetId) continue;
        db.run(
          `INSERT INTO uptimeChecks(target, targetId, provider, ok, latencyMs, status, error, checkedAt)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.target, r.targetId, r.provider || null, r.ok ? 1 : 0, Math.max(0, Math.floor(Number(r.latencyMs) || 0)), r.status ?? null, r.error ? String(r.error).slice(0, 500) : null, r.checkedAt || new Date().toISOString()]
        );
        n++;
      }
    });
    return n;
  } catch {
    return 0;
  }
}

/** Raw probes for a target within a window (ascending time). */
export async function getUptimeHistory({ target, targetId = null, days = 7, limit = 2000 } = {}) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
  const conds = ["checkedAt >= ?"];
  const params = [cutoff];
  if (target) { conds.push("target = ?"); params.push(target); }
  if (targetId) { conds.push("targetId = ?"); params.push(targetId); }
  params.push(Math.min(20000, Math.max(1, limit)));
  const rows = db.all(
    `SELECT target, targetId, provider, ok, latencyMs, status, error, checkedAt
     FROM uptimeChecks WHERE ${conds.join(" AND ")} ORDER BY checkedAt DESC LIMIT ?`,
    params
  );
  return rows.map((r) => ({
    target: r.target,
    targetId: r.targetId,
    provider: r.provider,
    ok: r.ok === 1,
    latencyMs: r.latencyMs || 0,
    status: r.status,
    error: r.error,
    checkedAt: r.checkedAt,
  })).reverse();
}

/** Distinct targets seen since a cutoff (for the dashboard target list). */
export async function getUptimeTargets(days = 7) {
  const db = await getAdapter();
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
  const rows = db.all(
    `SELECT target, targetId, MAX(provider) AS provider, COUNT(*) AS checks, MAX(checkedAt) AS lastCheckedAt
     FROM uptimeChecks WHERE checkedAt >= ? GROUP BY target, targetId ORDER BY targetId ASC`,
    [cutoff]
  );
  return rows.map((r) => ({
    target: r.target,
    targetId: r.targetId,
    provider: r.provider || null,
    checks: r.checks || 0,
    lastCheckedAt: r.lastCheckedAt,
  }));
}

/** Delete probes older than a window; returns rows removed. */
export async function pruneUptimeChecks(retentionDays = 30) {
  try {
    const db = await getAdapter();
    const cutoff = new Date(Date.now() - Math.max(1, retentionDays) * 86400000).toISOString();
    const before = db.get(`SELECT COUNT(*) AS n FROM uptimeChecks WHERE checkedAt < ?`, [cutoff])?.n || 0;
    if (before > 0) db.run(`DELETE FROM uptimeChecks WHERE checkedAt < ?`, [cutoff]);
    return before;
  } catch {
    return 0;
  }
}

export async function clearUptimeChecks() {
  try {
    const db = await getAdapter();
    db.run(`DELETE FROM uptimeChecks`);
    return true;
  } catch {
    return false;
  }
}

export { localDateKey };
