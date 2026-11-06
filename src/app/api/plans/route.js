import { NextResponse } from "next/server";
import { getPlans, createPlan } from "@/lib/db/repos/plansRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/plans - list all plans
export async function GET() {
  try {
    const plans = await getPlans();
    return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

// POST /api/plans - create a plan { name, description?, rank?, limits..., priceMonthly? }
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, ...rest } = body || {};
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const plan = await createPlan(name, rest);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return NextResponse.json({ error: error.message || "Failed to create plan" }, { status });
  }
}
