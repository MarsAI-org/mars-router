import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

// Per-plan limits. 0 = unlimited. Kept in one place so the repo, the engine and
// the API routes agree on the shape.
export const PLAN_LIMIT_KEYS = [
  "rpm", "tpm", "dailyRequests", "dailyTokens",
  "monthlyRequests", "monthlyTokens", "monthlyCost",
];

const NUMERIC_LIMIT_KEYS = PLAN_LIMIT_KEYS;

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function rowToPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    isActive: row.isActive === 1 || row.isActive === true,
    rank: Number(row.rank) || 0,
    rpm: row.rpm || 0,
    tpm: row.tpm || 0,
    dailyRequests: row.dailyRequests || 0,
    dailyTokens: row.dailyTokens || 0,
    monthlyRequests: row.monthlyRequests || 0,
    monthlyTokens: row.monthlyTokens || 0,
    monthlyCost: row.monthlyCost || 0,
    priceMonthly: row.priceMonthly || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Normalize a plan input object into safe column values. */
export function normalizePlanInput(input = {}) {
  const clean = {
    description: typeof input.description === "string" ? input.description.slice(0, 2000) : "",
    isActive: input.isActive === undefined ? true : input.isActive === true,
    rank: Number.isFinite(Number(input.rank)) ? Math.floor(Number(input.rank)) : 0,
    priceMonthly: toMoney(input.priceMonthly),
  };
  for (const key of NUMERIC_LIMIT_KEYS) clean[key] = toCount(input[key]);
  return clean;
}

export async function getPlans() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM plans ORDER BY rank DESC, name ASC`);
  return rows.map(rowToPlan);
}

export async function getActivePlans() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM plans WHERE isActive = 1 ORDER BY rank DESC, name ASC`);
  return rows.map(rowToPlan);
}

export async function getPlanById(id) {
  const db = await getAdapter();
  return rowToPlan(db.get(`SELECT * FROM plans WHERE id = ?`, [id]));
}

export async function getPlanByName(name) {
  const db = await getAdapter();
  return rowToPlan(db.get(`SELECT * FROM plans WHERE name = ?`, [name]));
}

export async function createPlan(name, input = {}) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Plan name is required");
  const db = await getAdapter();
  const existing = db.get(`SELECT id FROM plans WHERE name = ?`, [trimmed]);
  if (existing) throw new Error("A plan with that name already exists");

  const clean = normalizePlanInput(input);
  const now = new Date().toISOString();
  const id = uuidv4();
  db.run(
    `INSERT INTO plans(id, name, description, isActive, rank, rpm, tpm, dailyRequests, dailyTokens, monthlyRequests, monthlyTokens, monthlyCost, priceMonthly, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, trimmed, clean.description, clean.isActive ? 1 : 0, clean.rank,
      clean.rpm, clean.tpm, clean.dailyRequests, clean.dailyTokens,
      clean.monthlyRequests, clean.monthlyTokens, clean.monthlyCost, clean.priceMonthly,
      now, now,
    ]
  );
  return getPlanById(id);
}

export async function updatePlan(id, input = {}) {
  const db = await getAdapter();
  const existing = db.get(`SELECT * FROM plans WHERE id = ?`, [id]);
  if (!existing) return null;

  const clean = normalizePlanInput({
    description: input.description ?? existing.description,
    isActive: input.isActive ?? (existing.isActive === 1),
    rank: input.rank ?? existing.rank,
    priceMonthly: input.priceMonthly ?? existing.priceMonthly,
    ...Object.fromEntries(NUMERIC_LIMIT_KEYS.map((k) => [k, input[k] ?? existing[k]])),
  });

  let name = existing.name;
  if (input.name !== undefined) {
    const trimmed = String(input.name || "").trim();
    if (!trimmed) throw new Error("Plan name cannot be empty");
    const clash = db.get(`SELECT id FROM plans WHERE name = ? AND id != ?`, [trimmed, id]);
    if (clash) throw new Error("A plan with that name already exists");
    name = trimmed;
  }

  const now = new Date().toISOString();
  db.run(
    `UPDATE plans SET name = ?, description = ?, isActive = ?, rank = ?, rpm = ?, tpm = ?, dailyRequests = ?, dailyTokens = ?, monthlyRequests = ?, monthlyTokens = ?, monthlyCost = ?, priceMonthly = ?, updatedAt = ? WHERE id = ?`,
    [
      name, clean.description, clean.isActive ? 1 : 0, clean.rank,
      clean.rpm, clean.tpm, clean.dailyRequests, clean.dailyTokens,
      clean.monthlyRequests, clean.monthlyTokens, clean.monthlyCost, clean.priceMonthly,
      now, id,
    ]
  );
  return getPlanById(id);
}

export async function deletePlan(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM plans WHERE id = ?`, [id]);
  return true;
}
