import { NextResponse } from "next/server";
import { getSubscriptionById, updateSubscription, deleteSubscription } from "@/lib/db/repos/subscriptionsRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const sub = await getSubscriptionById(id);
    if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    return NextResponse.json({ subscription: sub });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}

// PUT /api/subscriptions/[id] - update status/plan/period/notes
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const allowed = ["status", "planId", "currentPeriodEnd", "notes"];
    const updates = Object.fromEntries(Object.entries(body || {}).filter(([k]) => allowed.includes(k)));
    const sub = await updateSubscription(id, updates);
    if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    return NextResponse.json({ subscription: sub });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update subscription" }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteSubscription(id);
    return NextResponse.json({ message: "Subscription deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }
}
