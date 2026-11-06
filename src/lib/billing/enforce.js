import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "@/sse/utils/logger.js";
import { resolveKeyPlan } from "./plans.resolve.js";
import { getKeyUsageSnapshot, evaluateKeyQuota } from "./quota.js";
import { recordAbuseEvent, countRecentAbuseEvents } from "@/lib/db/repos/abuseRepo.js";
import { getSettings } from "@/lib/db/index.js";

const KIND_LABEL = {
  rpm: "requests per minute",
  tpm: "tokens per minute",
  dailyRequests: "requests per day",
  dailyTokens: "tokens per day",
  monthlyRequests: "requests per month",
  monthlyTokens: "tokens per month",
  monthlyCost: "monthly cost budget",
};

/**
 * Enforce the plan quota for an identified API key before dispatch.
 * Fail-open: any error (DB down, unknown shape) returns null and lets the
 * request through — metering must never take the gateway offline.
 *
 * @param {string|null} keyId
 * @param {object} [opts]
 * @returns {Promise<Response|null>} a 429 Response when blocked, else null
 */
export async function enforceKeyQuota(keyId, { ip = null } = {}) {
  if (!keyId) return null;
  try {
    const settings = await getSettings();
    // Global kill-switch: billing enforcement is opt-in so a fresh install
    // (no plans, no subscriptions) behaves exactly like today.
    if (settings.billingEnforcementEnabled !== true) return null;

    const plan = await resolveKeyPlan(keyId);

    // A suspended subscription means the operator paused this customer's access.
    if (plan?.subscription && plan.subscription.status === "suspended") {
      log.warn("QUOTA", `⛔ key ${keyId.slice(0, 8)} subscription suspended`);
      return errorResponse(
        HTTP_STATUS.FORBIDDEN,
        "This API key's subscription is suspended. Contact the operator to restore access."
      );
    }

    if (!plan || Number(plan.rpm) === 0 && Number(plan.tpm) === 0
      && Number(plan.dailyRequests) === 0 && Number(plan.dailyTokens) === 0
      && Number(plan.monthlyRequests) === 0 && Number(plan.monthlyTokens) === 0
      && Number(plan.monthlyCost) === 0) {
      return null;
    }

    const usage = await getKeyUsageSnapshot(keyId);
    const result = evaluateKeyQuota(plan, usage);
    if (result.allowed) return null;

    const { kind, limit, current } = result.breached;
    const label = KIND_LABEL[kind] || kind;
    log.warn("QUOTA", `⛔ key ${keyId.slice(0, 8)} plan "${plan.name}" ${label} reached (${current}/${limit})`);

    // Record a (de-duplicated) abuse/quota event for the operator.
    const recent = await countRecentAbuseEvents(keyId, "quota_breach", 10 * 60 * 1000);
    if (recent === 0) {
      await recordAbuseEvent({
        keyId,
        kind: "quota_breach",
        severity: "warn",
        detail: `${label} limit reached (${current}/${limit}) on plan "${plan.name}"`,
        ip,
      });
    }

    const retryAfter = kind === "rpm" || kind === "tpm" ? 60 : 3600;
    return errorResponse(
      HTTP_STATUS.RATE_LIMITED,
      `Plan quota exceeded: ${label} limit reached (${current}/${limit}). Upgrade your plan or wait for the window to reset.`,
      { "Retry-After": String(retryAfter) }
    );
  } catch (e) {
    log.warn("QUOTA", `enforcement check failed (fail-open): ${e.message}`);
    return null;
  }
}

/** Record a completed request for quota windows + daily/monthly aggregates. */
export async function meterKeyRequest(keyId, { promptTokens = 0, completionTokens = 0, cost = 0, ip = null } = {}) {
  if (!keyId) return;
  try {
    const { recordKeyMinute } = await import("./quota.js");
    const { recordKeyUsage } = await import("@/lib/db/repos/keyUsageRepo.js");
    const total = (Number(promptTokens) || 0) + (Number(completionTokens) || 0);
    recordKeyMinute(keyId, total);
    await recordKeyUsage(keyId, { promptTokens, completionTokens, cost });
    void ip;
  } catch {
    // fail-open
  }
}
