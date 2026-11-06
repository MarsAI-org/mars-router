import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { getRollingUsage, checkProviderLimits } from "@/lib/limits/engine.js";
import { mergeLimitConfig } from "@/lib/limits/constants.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Read-only snapshot of per-provider rate/budget usage + remaining headroom.
// Returns every provider that has a limit entry configured (enabled or not).
export async function GET() {
  try {
    const settings = await getSettings();
    const limits = settings.providerLimits || {};
    const providers = {};

    for (const [provider, raw] of Object.entries(limits)) {
      const limit = mergeLimitConfig(raw);
      const usage = getRollingUsage(provider);
      let status = { allowed: true };
      try {
        status = checkProviderLimits(provider, raw);
      } catch {
        status = { allowed: true };
      }
      providers[provider] = {
        enabled: limit.enabled,
        enforce: limit.enforce,
        limits: {
          rpm: limit.rpm,
          tpm: limit.tpm,
          dailyRequests: limit.dailyRequests,
          dailyTokens: limit.dailyTokens,
          dailyCost: limit.dailyCost,
          monthlyCost: limit.monthlyCost,
        },
        usage: {
          rpm: usage.rpm,
          tpm: usage.tpm,
          dailyRequests: usage.dailyRequests,
          dailyTokens: usage.dailyTokens,
          dailyCost: usage.dailyCost,
          monthlyCost: usage.monthlyCost,
        },
        allowed: status.allowed,
        breachedKind: status.breachedKind || null,
      };
    }

    return NextResponse.json({ providers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
