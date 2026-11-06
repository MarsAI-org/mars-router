import { NextResponse } from "next/server";
import { buildSalesAnalytics } from "@/lib/billing/analytics.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/billing/analytics?days=30 - revenue, per-key usage, margin
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
    const analytics = await buildSalesAnalytics(days);
    return NextResponse.json(analytics, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to build analytics" }, { status: 500 });
  }
}
