import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

export const ABUSE_KINDS = ["rate_spike", "multi_ip", "error_burst", "quota_breach"];
export const ABUSE_SEVERITIES = ["info", "warn", "critical"];

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    keyId: row.keyId || null,
    kind: row.kind,
    severity: row.severity,
    detail: row.detail || "",
    ip: row.ip || null,
    createdAt: row.createdAt,
  };
}

/** Record an abuse event. Fail-open: never throws from the hot path. */
export async function recordAbuseEvent({ keyId = null, kind, severity = "warn", detail = "", ip = null } = {}) {
  try {
    if (!kind || !ABUSE_KINDS.includes(kind)) return null;
    const db = await getAdapter();
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    db.run(
      `INSERT INTO abuseEvents(id, keyId, kind, severity, detail, ip, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [id, keyId, kind, ABUSE_SEVERITIES.includes(severity) ? severity : "warn", String(detail || "").slice(0, 2000), ip, createdAt]
    );
    return { id, keyId, kind, severity, detail, ip, createdAt };
  } catch {
    return null;
  }
}

export async function getAbuseEvents({ keyId = null, limit = 100 } = {}) {
  const db = await getAdapter();
  const lim = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 100)));
  const rows = keyId
    ? db.all(`SELECT * FROM abuseEvents WHERE keyId = ? ORDER BY createdAt DESC LIMIT ?`, [keyId, lim])
    : db.all(`SELECT * FROM abuseEvents ORDER BY createdAt DESC LIMIT ?`, [lim]);
  return rows.map(rowToEvent);
}

/** Count recent events of a kind for a key (for de-duplication / escalation). */
export async function countRecentAbuseEvents(keyId, kind, windowMs = 60 * 60 * 1000) {
  const db = await getAdapter();
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = db.get(
    `SELECT COUNT(*) AS n FROM abuseEvents WHERE keyId = ? AND kind = ? AND createdAt >= ?`,
    [keyId, kind, since]
  );
  return row?.n || 0;
}

export async function clearAbuseEvents(keyId = null) {
  const db = await getAdapter();
  if (keyId) db.run(`DELETE FROM abuseEvents WHERE keyId = ?`, [keyId]);
  else db.run(`DELETE FROM abuseEvents`);
  return true;
}
