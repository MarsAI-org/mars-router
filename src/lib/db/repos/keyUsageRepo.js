import { getAdapter } from "../driver.js";

// Daily aggregate per API key. Used by the quota engine (monthly/daily windows)
// and by the sales analytics dashboard. Reset boundaries follow the local date
// key so a "day" matches what the operator sees in Usage.
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthPrefix(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Increment a key's usage counters for today. Fail-open: never throws so a
 * metering failure cannot break an inference request.
 */
export async function recordKeyUsage(keyId, { promptTokens = 0, completionTokens = 0, cost = 0 } = {}) {
  try {
    if (!keyId) return;
    const db = await getAdapter();
    const dateKey = localDateKey();
    const now = new Date().toISOString();
    const p = Math.max(0, Math.floor(Number(promptTokens) || 0));
    const c = Math.max(0, Math.floor(Number(completionTokens) || 0));
    const k = Number(cost) || 0;
    db.run(
      `INSERT INTO keyUsageDaily(keyId, dateKey, requests, promptTokens, completionTokens, cost, updatedAt)
       VALUES(?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(keyId, dateKey) DO UPDATE SET
         requests = requests + 1,
         promptTokens = promptTokens + excluded.promptTokens,
         completionTokens = completionTokens + excluded.completionTokens,
         cost = cost + excluded.cost,
         updatedAt = excluded.updatedAt`,
      [keyId, dateKey, p, c, k, now]
    );
  } catch {
    // fail-open
  }
}

/** Usage for a single local day (defaults to today). */
export async function getKeyUsageForDay(keyId, date = new Date()) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM keyUsageDaily WHERE keyId = ? AND dateKey = ?`, [keyId, localDateKey(date)]);
  return row
    ? { requests: row.requests || 0, promptTokens: row.promptTokens || 0, completionTokens: row.completionTokens || 0, cost: row.cost || 0 }
    : { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
}

/** Aggregated usage across every day in the current calendar month. */
export async function getKeyUsageForMonth(keyId, date = new Date()) {
  const db = await getAdapter();
  const row = db.get(
    `SELECT COALESCE(SUM(requests),0) AS requests,
            COALESCE(SUM(promptTokens),0) AS promptTokens,
            COALESCE(SUM(completionTokens),0) AS completionTokens,
            COALESCE(SUM(cost),0) AS cost
     FROM keyUsageDaily WHERE keyId = ? AND dateKey LIKE ?`,
    [keyId, `${monthPrefix(date)}%`]
  );
  return {
    requests: row?.requests || 0,
    promptTokens: row?.promptTokens || 0,
    completionTokens: row?.completionTokens || 0,
    cost: row?.cost || 0,
  };
}

/** Daily rows within a window for analytics (ascending by date). */
export async function getKeyUsageSeries(keyId, days = 30) {
  const db = await getAdapter();
  return db.all(
    `SELECT dateKey, requests, promptTokens, completionTokens, cost FROM keyUsageDaily
     WHERE keyId = ? ORDER BY dateKey DESC LIMIT ?`,
    [keyId, Math.max(1, Math.floor(days))]
  ).map((r) => ({
    dateKey: r.dateKey,
    requests: r.requests || 0,
    promptTokens: r.promptTokens || 0,
    completionTokens: r.completionTokens || 0,
    cost: r.cost || 0,
  })).reverse();
}

/**
 * Totals per key for a window, for the sales dashboard. Returns a Map-like
 * object keyed by keyId.
 */
export async function getUsageTotalsByKey(days = 30) {
  const db = await getAdapter();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Math.max(1, Math.floor(days)) - 1));
  const rows = db.all(
    `SELECT keyId,
            COALESCE(SUM(requests),0) AS requests,
            COALESCE(SUM(promptTokens),0) AS promptTokens,
            COALESCE(SUM(completionTokens),0) AS completionTokens,
            COALESCE(SUM(cost),0) AS cost
     FROM keyUsageDaily WHERE dateKey >= ? GROUP BY keyId`,
    [localDateKey(cutoff)]
  );
  const out = {};
  for (const r of rows) {
    out[r.keyId] = {
      requests: r.requests || 0,
      promptTokens: r.promptTokens || 0,
      completionTokens: r.completionTokens || 0,
      cost: r.cost || 0,
    };
  }
  return out;
}

export { localDateKey, monthPrefix };
