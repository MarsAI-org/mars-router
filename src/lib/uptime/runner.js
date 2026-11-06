import { pingModelByKind } from "@/app/api/models/test/ping";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { recordUptimeChecks } from "@/lib/db/repos/uptimeRepo.js";

const DEFAULT_CONCURRENCY = 6;

const baseUrl = () => `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;

/** Map a /v1/models entry to the kind pingModelByKind expects. */
function kindOfEntry(entry) {
  const k = entry?.kind;
  if (!k || k === "llm") return "llm";
  return k;
}

/**
 * Run a bounded-concurrency map. Every task is wrapped so one failure never
 * rejects the batch.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let index = 0;
  const size = Math.max(1, Math.min(Number(limit) || DEFAULT_CONCURRENCY, list.length || 1));

  async function run() {
    while (true) {
      const i = index++;
      if (i >= list.length) return;
      try {
        results[i] = await worker(list[i], i);
      } catch (e) {
        results[i] = { ok: false, error: e?.message || String(e), latencyMs: 0 };
      }
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return results;
}

/**
 * Test a list of model entries (from buildModelsList) and persist the results.
 * @param {Array<{id:string, owned_by?:string, kind?:string}>} entries
 * @param {{ concurrency?:number, persist?:boolean }} [opts]
 */
export async function runModelChecks(entries, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const concurrency = opts.concurrency || DEFAULT_CONCURRENCY;
  const url = baseUrl();

  // Warm-up with the first model to absorb a token refresh before parallel calls.
  const out = await mapWithConcurrency(list, concurrency, async (entry) => {
    const result = await pingModelByKind(entry.id, kindOfEntry(entry), url);
    return {
      target: "model",
      targetId: entry.id,
      provider: entry.owned_by || null,
      ok: result.ok === true,
      latencyMs: result.latencyMs || 0,
      status: result.status ?? null,
      error: result.ok ? null : (result.error || "unknown error"),
    };
  });

  if (opts.persist !== false) {
    await recordUptimeChecks(out);
  }
  return out;
}

/**
 * Test a single model by id, persist and return the result.
 */
export async function runSingleModelCheck(targetId, provider = null) {
  const result = await pingModelByKind(targetId, "llm", baseUrl());
  const row = {
    target: "model",
    targetId,
    provider,
    ok: result.ok === true,
    latencyMs: result.latencyMs || 0,
    status: result.status ?? null,
    error: result.ok ? null : (result.error || "unknown error"),
  };
  await recordUptimeChecks([row]);
  return row;
}
