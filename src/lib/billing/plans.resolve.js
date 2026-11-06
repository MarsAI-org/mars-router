// Tier/plan resolution for the reseller billing layer.
//
// A request's effective limits come from the plan assigned to its API key via a
// subscription. Resolution is fail-open: a key with no subscription, a missing
// plan, or a suspended subscription falls back to the built-in Free/default
// behaviour (no billing limits) rather than blocking traffic.
import { getSubscriptionByKeyId } from "@/lib/db/repos/subscriptionsRepo.js";
import { getPlanById } from "@/lib/db/repos/plansRepo.js";

// Fallback plan used when a key has no active subscription. Zero limits means
// "unlimited" so a fresh install with no plans configured never locks out.
export const DEFAULT_PLAN = Object.freeze({
  id: null,
  name: "Default",
  rpm: 0,
  tpm: 0,
  dailyRequests: 0,
  dailyTokens: 0,
  monthlyRequests: 0,
  monthlyTokens: 0,
  monthlyCost: 0,
  priceMonthly: 0,
  isActive: true,
  rank: 0,
});

/**
 * Resolve the plan governing a key. Only an ACTIVE subscription grants its
 * plan's limits; a suspended/canceled subscription is treated as no plan.
 * @returns {Promise<object>} the plan (or DEFAULT_PLAN)
 */
export async function resolveKeyPlan(keyId) {
  if (!keyId) return { ...DEFAULT_PLAN };
  try {
    const sub = await getSubscriptionByKeyId(keyId);
    if (!sub || sub.status !== "active") return { ...DEFAULT_PLAN, subscription: sub || null };
    const plan = await getPlanById(sub.planId);
    if (!plan || !plan.isActive) return { ...DEFAULT_PLAN, subscription: sub };
    return { ...plan, subscription: sub };
  } catch {
    return { ...DEFAULT_PLAN };
  }
}

export function planHasAnyLimit(plan) {
  if (!plan) return false;
  return ["rpm", "tpm", "dailyRequests", "dailyTokens", "monthlyRequests", "monthlyTokens", "monthlyCost"]
    .some((k) => Number(plan[k]) > 0);
}
