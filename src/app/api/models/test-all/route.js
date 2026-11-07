import { NextResponse } from "next/server";
import { buildModelsList } from "@/app/api/v1/models/route";
import { runModelChecks, mapWithConcurrency } from "@/lib/uptime/runner.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/models/test-all
 * Body (optional): { kinds?: string[], providers?: string[], concurrency?: number, persist?: boolean, timeoutMs?: number }
 * Tests every model the gateway publishes and returns per-model results.
 *
 * A whole-run deadline (default 120s, capped by the platform maxDuration) keeps
 * a large catalog from hanging the request: models not reached before the
 * deadline are reported as `{ ok:false, error:"skipped: deadline" }` instead of
 * leaving the client with no response at all.
 */
export async function POST(request) {
  try {
    let opts = {};
    try { opts = await request.json(); } catch { /* empty body is fine */ }

    const kinds = Array.isArray(opts.kinds) && opts.kinds.length ? opts.kinds : ["llm"];
    const providerFilter = Array.isArray(opts.providers) && opts.providers.length
      ? new Set(opts.providers.map((p) => String(p).toLowerCase()))
      : null;
    const deadlineMs = Math.min(Number(opts.timeoutMs) || 120000, 290000);

    // Resolve the published catalog for each requested kind, then dedupe by id.
    const entriesById = new Map();
    for (const kind of kinds) {
      let list = [];
      try { list = await buildModelsList([kind], {}); } catch { list = []; }
      for (const entry of list) {
        if (!entry?.id || entriesById.has(entry.id)) continue;
        if (providerFilter && !providerFilter.has(String(entry.owned_by || "").toLowerCase())) continue;
        entriesById.set(entry.id, entry);
      }
    }

    const entries = [...entriesById.values()];
    if (entries.length === 0) {
      return NextResponse.json({ error: "No models to test", count: 0, results: [] });
    }

    const results = await runModelChecks(entries, {
      concurrency: Number(opts.concurrency) || 6,
      persist: opts.persist !== false,
      deadlineMs,
    });

    const ok = results.filter((r) => r.ok).length;
    return NextResponse.json({
      count: results.length,
      ok,
      failed: results.length - ok,
      results,
    });
  } catch (error) {
    console.log("Error testing all models:", error);
    return NextResponse.json({ error: error.message || "Test failed" }, { status: 500 });
  }
}

export { mapWithConcurrency };
