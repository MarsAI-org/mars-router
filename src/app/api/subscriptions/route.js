import { NextResponse } from "next/server";
import { getSubscriptions, setSubscription } from "@/lib/db/repos/subscriptionsRepo.js";
import { getPlanById } from "@/lib/db/repos/plansRepo.js";
import { getApiKeyById } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/subscriptions - list all subscriptions, populated with plan & key names
export async function GET() {
  try {
    const rawSubs = await getSubscriptions();
    const subs = await Promise.all(rawSubs.map(async (s) => {
      const [plan, key] = await Promise.all([
        getPlanById(s.planId),
        getApiKeyById(s.keyId),
      ]);
      return {
        ...s,
        planName: plan?.name || "Unknown",
        planPrice: plan?.priceMonthly || 0,
        keyName: key?.name || s.keyId.slice(0, 8),
      };
    }));
    return NextResponse.json({ subscriptions: subs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

// POST /api/subscriptions - assign or replace plan for a key { keyId, planId, status?, notes?, currentPeriodEnd? }
export async function POST(request) {
  try {
    const body = await request.json();
    const { keyId, planId, status = "active", notes = "", currentPeriodEnd = null } = body || {};
    if (!keyId) return NextResponse.json({ error: "keyId is required" }, { status: 400 });
    if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

    const [key, plan] = await Promise.all([getApiKeyById(keyId), getPlanById(planId)]);
    if (!key) return NextResponse.json({ error: "API key not found" }, { status: 404 });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const sub = await setSubscription(keyId, planId, { status, notes, currentPeriodEnd });
    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to set subscription" }, { status: 400 });
  }
}
