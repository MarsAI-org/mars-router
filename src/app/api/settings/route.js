import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import { sanitizeProviderLimits, sanitizeRetryPolicy, sanitizeFallbackPolicy, sanitizeAbuseMonitoring, sanitizePromptInjections, sanitizeModelCatalog } from "@/lib/settingsSanitizers.js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password", "mitmSudoEncrypted"];

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    // Strip protected secrets before any internal handling sets them
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "123456"
        if (body.currentPassword && body.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    // Sanitize the flexible routing-control settings so a malformed payload
    // can never corrupt the stored settings object (defense-in-depth, CWE-915).
    if (Object.prototype.hasOwnProperty.call(body, "providerLimits")) {
      body.providerLimits = sanitizeProviderLimits(body.providerLimits);
    }
    if (Object.prototype.hasOwnProperty.call(body, "retryPolicy")) {
      body.retryPolicy = sanitizeRetryPolicy(body.retryPolicy);
    }
    if (Object.prototype.hasOwnProperty.call(body, "fallbackPolicy")) {
      body.fallbackPolicy = sanitizeFallbackPolicy(body.fallbackPolicy);
    }
    if (Object.prototype.hasOwnProperty.call(body, "billingEnforcementEnabled")) {
      body.billingEnforcementEnabled = body.billingEnforcementEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(body, "abuseMonitoring")) {
      body.abuseMonitoring = sanitizeAbuseMonitoring(body.abuseMonitoring);
    }
    if (Object.prototype.hasOwnProperty.call(body, "promptInjections")) {
      body.promptInjections = sanitizePromptInjections(body.promptInjections);
    }
    if (Object.prototype.hasOwnProperty.call(body, "modelCatalog")) {
      body.modelCatalog = sanitizeModelCatalog(body.modelCatalog);
    }

    const settings = await updateSettings(body);

    // Reset in-memory limit counters when limits change so the new config
    // takes effect immediately instead of waiting for the window to roll over.
    if (Object.prototype.hasOwnProperty.call(body, "providerLimits")) {
      try {
        const { resetProviderLimitState } = await import("@/lib/limits/engine.js");
        resetProviderLimitState();
      } catch {
        // fail-open
      }
    }

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "claudeAutoPing") ||
      Object.prototype.hasOwnProperty.call(body, "codexAutoPing")
    ) {
      // Keep the scheduler absent when no account opted in; load its provider graph only on demand.
      import("@/shared/services/quotaAutoPing")
        .then(({ configureQuotaAutoPing }) => {
          configureQuotaAutoPing(settings);
        })
        .catch((error) => console.warn("[AutoPing] settings update failed:", error.message));
    }

    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
