import { NextResponse } from "next/server";
import { getPlanById, updatePlan, deletePlan } from "@/lib/db/repos/plansRepo.js";
import { getSubscriptions } from "@/lib/db/repos/subscriptionsRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/plans/[id]
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 });
  }
}

// PUT /api/plans/[id]
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const plan = await updatePlan(id, body || {});
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ plan });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return NextResponse.json({ error: error.message || "Failed to update plan" }, { status });
  }
}

// DELETE /api/plans/[id] - refuses while keys are still subscribed.
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const subs = await getSubscriptions();
    const inUse = subs.filter((s) => s.planId === id);
    if (inUse.length) {
      return NextResponse.json(
        { error: `Plan is in use by ${inUse.length} subscription(s); reassign or cancel them first.` },
        { status: 409 }
      );
    }
    await deletePlan(id);
    return NextResponse.json({ message: "Plan deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
