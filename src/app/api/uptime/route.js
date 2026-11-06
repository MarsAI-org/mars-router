import { NextResponse } from "next/server";
import {
  getUptimeHistory, clearUptimeChecks,
} from "@/lib/db/repos/uptimeRepo.js";
import { summarizeByTarget, summarizeUptime } from "@/lib/uptime/engine.js";
import { runModelChecks, runSingleModelCheck } from "@/lib/uptime/runner.js";
import { buildModelsList } from "@/app/api/v1/models/route";
import { getCombos } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/uptime?days=7 - per-target uptime summary + worst-first list
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10) || 7));
    const checks = await getUptimeHistory({ days, limit: 20000 });
    const targets = summarizeByTarget(checks);
    const overall = summarizeUptime(checks);
    return NextResponse.json({ days, overall, targets }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load uptime" }, { status: 500 });
  }
}

// POST /api/uptime - run probes now.
// Body: { target: "model"|"combo"|"all", id?: string, models?: string[] }
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const target = body.target || "all";

    if (target === "model" && body.id) {
      const [provider] = String(body.id).split("/");
      const row = await runSingleModelCheck(body.id, provider || null);
      return NextResponse.json({ results: [row] }, { headers: NO_STORE });
    }

    if (target === "model" && Array.isArray(body.models) && body.models.length) {
      const entries = body.models.map((id) => ({ id, owned_by: String(id).split("/")[0], kind: "llm" }));
      const results = await runModelChecks(entries, { concurrency: Number(body.concurrency) || 6 });
      return NextResponse.json({ results }, { headers: NO_STORE });
    }

    if (target === "combo" && body.id) {
      const combos = await getCombos();
      const combo = combos.find((c) => c.name === body.id);
      if (!combo) return NextResponse.json({ error: "Combo not found" }, { status: 404 });
      return NextResponse.json({ results: await probeCombo(combo) }, { headers: NO_STORE });
    }

    // all: probe every published LLM model + every combo
    const [entries, combos] = await Promise.all([
      buildModelsList(["llm"], {}).catch(() => []),
      getCombos().catch(() => []),
    ]);
    const modelResults = await runModelChecks(entries, { concurrency: Number(body.concurrency) || 6 });
    const comboResults = [];
    for (const combo of combos) {
      comboResults.push(...await probeCombo(combo));
    }
    return NextResponse.json({ results: [...modelResults, ...comboResults] }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Uptime run failed" }, { status: 500 });
  }
}

// DELETE /api/uptime - clear all probe history
export async function DELETE() {
  try {
    await clearUptimeChecks();
    return NextResponse.json({ message: "Cleared" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to clear uptime" }, { status: 500 });
  }
}

// A combo is up when any of its members answers; record one row per member so the
// operator can see which seat carried it.
async function probeCombo(combo) {
  const seats = Array.isArray(combo.models) ? combo.models : [];
  if (seats.length === 0) return [];
  const { mapWithConcurrency } = await import("@/lib/uptime/runner.js");
  const results = await mapWithConcurrency(seats, 4, async (seat) => {
    const r = await runSingleModelCheck(seat, String(seat).split("/")[0] || null);
    return { ...r, target: "combo", targetId: `${combo.name} → ${seat}`, provider: String(seat).split("/")[0] || null };
  });
  // Persist under the combo target label too.
  const { recordUptimeChecks } = await import("@/lib/db/repos/uptimeRepo.js");
  await recordUptimeChecks(results.map((r) => ({ ...r, targetId: `${combo.name} → ${r.targetId}`, target: "combo" })));
  return results;
}
