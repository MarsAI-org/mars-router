import { getKeyUsageForDay, getKeyUsageForMonth } from "@/lib/db/repos/keyUsageRepo.js";

// In-memory sliding-minute counters per API key (shared across modules).
if (!global._keyQuotaState) global._keyQuotaState = { minute: {} };
const state = global._keyQuotaState;

const MINUTE_MS = 60 * 1000;

function prune(list, now) {
  const cutoff = now - MINUTE_MS;
  let i = 0;
  while (i < list.length && list[i] < cutoff) i++;
  return i ? list.slice(i) : list;
}

function bucket(keyId) {
  return state.minute[keyId] || (state.minute[keyId] = { requests: [], tokens: [] });
}

/** Record a successful request against the key's rolling-minute window. */
export function recordKeyMinute(keyId, tokens = 0) {
  if (!keyId) return;
  const now = Date.now();
  const b = bucket(keyId);
  b.requests = prune(b.requests, now);
  b.requests.push(now);
  const t = Number(tokens) || 0;
  if (t > 0) {
    b.tokens = prune(b.tokens, now);
    b.tokens.push([now, t]);
  }
}

function sumMinute(list, now) {
  const cutoff = now - MINUTE_MS;
  let total = 0;
  for (const item of list) {
    if (Array.isArray(item)) { if (item[0] >= cutoff) total += item[1]; }
    else if (item >= cutoff) total += 1;
  }
  return total;
}

/** Current rolling usage snapshot for a key (minute + day + month). */
export async function getKeyUsageSnapshot(keyId) {
  const now = Date.now();
  const b = bucket(keyId);
  const minuteTokens = sumMinute(b.tokens, now);
  const [day, month] = await Promise.all([
    getKeyUsageForDay(keyId),
    getKeyUsageForMonth(keyId),
  ]);
  return {
    rpm: sumMinute(b.requests, now),
    tpm: minuteTokens,
    dayRequests: day.requests,
    dayTokens: day.promptTokens + day.completionTokens,
    monthRequests: month.requests,
    monthTokens: month.promptTokens + month.completionTokens,
    monthCost: month.cost,
  };
}

/**
 * Evaluate a plan's limits against a key's current usage.
 * 0 = unlimited for every field.
 * @returns {{ allowed:boolean, breached?:{kind:string,limit:number,current:number}, usage:object }}
 */
export function evaluateKeyQuota(plan, usage) {
  const checks = [
    ["rpm", usage.rpm, plan.rpm],
    ["tpm", usage.tpm, plan.tpm],
    ["dailyRequests", usage.dayRequests, plan.dailyRequests],
    ["dailyTokens", usage.dayTokens, plan.dailyTokens],
    ["monthlyRequests", usage.monthRequests, plan.monthlyRequests],
    ["monthlyTokens", usage.monthTokens, plan.monthlyTokens],
    ["monthlyCost", usage.monthCost, plan.monthlyCost],
  ];
  for (const [kind, current, cap] of checks) {
    const limit = Number(cap) || 0;
    if (limit > 0 && current >= limit) {
      return { allowed: false, breached: { kind, limit, current }, usage };
    }
  }
  return { allowed: true, usage };
}

export function resetKeyQuotaState(keyId = null) {
  if (keyId) delete state.minute[keyId];
  else state.minute = {};
}
