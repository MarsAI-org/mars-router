import { NextResponse } from "next/server";
import { resolveKeyPlan, planHasAnyLimit } from "@/lib/billing/plans.resolve.js";
import { getKeyUsageSnapshot } from "@/lib/billing/quota.js";
import { getApiKeyById } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/billing/quota/[keyId] - live quota usage + headroom for a key
export async function GET(request, { params }) {
  try {
    const { keyId } = await params;
    const [key, plan, usage] = await Promise.all([
      getApiKeyById(keyId),
      resolveKeyPlan(keyId),
      getKeyUsageSnapshot(keyId),
    ]);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const limits = {
      rpm: plan.rpm || 0,
      tpm: plan.tpm || 0,
      dailyRequests: plan.dailyRequests || 0,
      dailyTokens: plan.dailyTokens || 0,
      monthlyRequests: plan.monthlyRequests || 0,
      monthlyTokens: plan.monthlyTokens || 0,
      monthlyCost: plan.monthlyCost || 0,
    };

    const remaining = {
      rpm: limits.rpm ? Math.max(0, limits.rpm - usage.rpm) : null,
      tpm: limits.tpm ? Math.max(0, limits.tpm - usage.tpm) : null,
      dailyRequests: limits.dailyRequests ? Math.max(0, limits.dailyRequests - usage.dayRequests) : null,
      dailyTokens: limits.dailyTokens ? Math.max(0, limits.dailyTokens - usage.dayTokens) : null,
      monthlyRequests: limits.monthlyRequests ? Math.max(0, limits.monthlyRequests - usage.monthRequests) : null,
      monthlyTokens: limits.monthlyTokens ? Math.max(0, limits.monthlyTokens - usage.monthTokens) : null,
      monthlyCost: limits.monthlyCost ? Math.max(0, limits.monthlyCost - usage.monthCost) : null,
    };

    return NextResponse.json({
      keyId,
      keyName: key.name || keyId.slice(0, 8),
      plan: { id: plan.id, name: plan.name, isLimited: planHasAnyLimit(plan) },
      subscriptionStatus: plan.subscription?.status || "none",
      limits,
      usage,
      remaining,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to compute quota" }, { status: 500 });
  }
}
