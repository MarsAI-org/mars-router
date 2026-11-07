import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { sanitizeUpstreamLimits } from "@/lib/settingsSanitizers.js";
import { getFlowController, mergeFlowConfig } from "@/lib/flowControl/engine.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/flow-control - configured per-provider upstream limits + live status
// (active in-flight, queued waiters, RPM used/remaining).
export async function GET() {
  try {
    const settings = await getSettings();
    const limits = settings.upstreamLimits || {};
    const controller = getFlowController();
    const providers = {};
    for (const [provider, cfg] of Object.entries(limits)) {
      providers[provider] = {
        config: mergeFlowConfig(cfg),
        live: controller.status(provider, cfg),
      };
    }
    return NextResponse.json({ providers }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load flow control" }, { status: 500 });
  }
}

// PUT /api/flow-control - replace the upstream limits map (validated).
// Body: { [providerId]: { enabled, maxConcurrent, rpm, queueTimeoutMs, maxQueue } }
export async function PUT(request) {
  try {
    const body = await request.json();
    const limits = sanitizeUpstreamLimits(body?.upstreamLimits ?? body);
    await updateSettings({ upstreamLimits: limits });
    return NextResponse.json({ upstreamLimits: limits }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save flow control" }, { status: 400 });
  }
}
