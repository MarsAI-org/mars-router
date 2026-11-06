import { NextResponse } from "next/server";
import { getUptimeHistory } from "@/lib/db/repos/uptimeRepo.js";
import { summarizeUptime, bucketByDay } from "@/lib/uptime/engine.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/uptime/[targetId]?days=7 — detail, latency summary and daily sparkline.
// targetId is URL-encoded (model ids contain "/", combos contain " → ").
export async function GET(request, { params }) {
  try {
    const { targetId } = await params;
    const id = decodeURIComponent(targetId);
    const url = new URL(request.url);
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10) || 7));

    const checks = await getUptimeHistory({ targetId: id, days, limit: 10000 });
    return NextResponse.json({
      targetId: id,
      days,
      summary: summarizeUptime(checks),
      sparkline: bucketByDay(checks, days),
      recent: checks.slice(-100),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load uptime detail" }, { status: 500 });
  }
}
