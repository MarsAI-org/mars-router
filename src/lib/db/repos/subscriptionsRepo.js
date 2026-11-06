import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

export const SUBSCRIPTION_STATUSES = ["active", "suspended", "canceled"];

function rowToSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    keyId: row.keyId,
    planId: row.planId,
    status: row.status || "active",
    startedAt: row.startedAt,
    currentPeriodEnd: row.currentPeriodEnd || null,
    notes: row.notes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getSubscriptions() {
  const db = await getAdapter();
  return db.all(`SELECT * FROM subscriptions ORDER BY createdAt DESC`).map(rowToSubscription);
}

export async function getSubscriptionByKeyId(keyId) {
  const db = await getAdapter();
  return rowToSubscription(
    db.get(`SELECT * FROM subscriptions WHERE keyId = ? ORDER BY createdAt DESC LIMIT 1`, [keyId])
  );
}

export async function getSubscriptionById(id) {
  const db = await getAdapter();
  return rowToSubscription(db.get(`SELECT * FROM subscriptions WHERE id = ?`, [id]));
}

/**
 * Create or replace the subscription for a key. One subscription per key:
 * assigning a new plan updates the existing row (or creates it).
 */
export async function setSubscription(keyId, planId, { status = "active", currentPeriodEnd = null, notes = "" } = {}) {
  if (!keyId) throw new Error("keyId is required");
  if (!planId) throw new Error("planId is required");
  const db = await getAdapter();
  const now = new Date().toISOString();
  const existing = db.get(`SELECT id FROM subscriptions WHERE keyId = ?`, [keyId]);
  if (existing) {
    db.run(
      `UPDATE subscriptions SET planId = ?, status = ?, currentPeriodEnd = ?, notes = ?, updatedAt = ? WHERE id = ?`,
      [planId, status, currentPeriodEnd, notes, now, existing.id]
    );
    return getSubscriptionById(existing.id);
  }
  const id = uuidv4();
  db.run(
    `INSERT INTO subscriptions(id, keyId, planId, status, startedAt, currentPeriodEnd, notes, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, keyId, planId, status, now, currentPeriodEnd, notes, now, now]
  );
  return getSubscriptionById(id);
}

export async function updateSubscription(id, updates = {}) {
  const db = await getAdapter();
  const existing = db.get(`SELECT * FROM subscriptions WHERE id = ?`, [id]);
  if (!existing) return null;
  const fields = ["status", "planId", "currentPeriodEnd", "notes"];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (updates[f] !== undefined) { sets.push(`${f} = ?`); params.push(updates[f]); }
  }
  if (!sets.length) return rowToSubscription(existing);
  sets.push("updatedAt = ?");
  params.push(new Date().toISOString());
  params.push(id);
  db.run(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`, params);
  return getSubscriptionById(id);
}

export async function deleteSubscription(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM subscriptions WHERE id = ?`, [id]);
  return true;
}
