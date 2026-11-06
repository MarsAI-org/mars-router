import { NextResponse } from "next/server";
import { getAbuseEvents, clearAbuseEvents } from "@/lib/db/repos/abuseRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/billing/abuse?keyId=&limit= - recent anti-abuse events
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const keyId = url.searchParams.get("keyId") || null;
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const events = await getAbuseEvents({ keyId, limit });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch abuse events" }, { status: 500 });
  }
}

// DELETE /api/billing/abuse?keyId= - clear events (all, or one key)
export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const keyId = url.searchParams.get("keyId") || null;
    await clearAbuseEvents(keyId);
    return NextResponse.json({ message: "Cleared" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to clear abuse events" }, { status: 500 });
  }
}
