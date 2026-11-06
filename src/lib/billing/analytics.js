import { getUsageTotalsByKey } from "@/lib/db/repos/keyUsageRepo.js";
import { getSubscriptions } from "@/lib/db/repos/subscriptionsRepo.js";
import { getPlans } from "@/lib/db/repos/plansRepo.js";
import { getApiKeys } from "@/lib/db/repos/apiKeysRepo.js";

/**
 * Build the sales/analytics view for the reseller dashboard.
 *
 * - revenue = sum of active subscriptions' plan list price (MRR).
 * - margin = revenue - provider cost consumed by those keys in the window.
 * - per-key rows carry usage, the assigned plan, and the key's own cost.
 *
 * Pure aggregation over repos (no request objects) so it is unit-testable.
 * @param {number} days window for usage totals
 */
export async function buildSalesAnalytics(days = 30) {
  const [keys, plans, subscriptions, usageByKey] = await Promise.all([
    getApiKeys(),
    getPlans(),
    getSubscriptions(),
    getUsageTotalsByKey(days),
  ]);

  const planById = new Map(plans.map((p) => [p.id, p]));
  const subByKey = new Map();
  for (const s of subscriptions) subByKey.set(s.keyId, s);

  let mrr = 0;
  const rows = keys.map((key) => {
    const sub = subByKey.get(key.id) || null;
    const plan = sub ? planById.get(sub.planId) || null : null;
    const active = sub?.status === "active";
    if (active && plan) mrr += Number(plan.priceMonthly) || 0;

    const usage = usageByKey[key.id] || { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    const revenue = active && plan ? Number(plan.priceMonthly) || 0 : 0;

    return {
      keyId: key.id,
      keyName: key.name || key.id.slice(0, 8),
      isActive: key.isActive,
      planId: plan?.id || null,
      planName: plan?.name || "—",
      planPrice: revenue,
      subscriptionStatus: sub?.status || "none",
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      tokens: usage.promptTokens + usage.completionTokens,
      providerCost: usage.cost,
      // Gross margin per key over the window (plan price is monthly; this is a
      // simple window-agnostic comparison the operator can read at a glance).
      margin: revenue - usage.cost,
    };
  });

  const totalProviderCost = rows.reduce((s, r) => s + r.providerCost, 0);
  const totalRequests = rows.reduce((s, r) => s + r.requests, 0);
  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);

  const topByUsage = [...rows].sort((a, b) => b.requests - a.requests).slice(0, 10);
  const topByCost = [...rows].sort((a, b) => b.providerCost - a.providerCost).slice(0, 10);

  return {
    periodDays: days,
    summary: {
      totalKeys: keys.length,
      activeSubscriptions: subscriptions.filter((s) => s.status === "active").length,
      mrr,
      totalRequests,
      totalTokens,
      totalProviderCost,
      grossMargin: mrr - totalProviderCost,
    },
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      isActive: p.isActive,
      subscribers: subscriptions.filter((s) => s.planId === p.id && s.status === "active").length,
    })),
    rows,
    topByUsage,
    topByCost,
  };
}
