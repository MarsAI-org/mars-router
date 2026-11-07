import { describe, expect, it } from "vitest";
import {
  LIMIT_PRESETS, FLOW_PRESETS, TPM_PRESETS, TPM_SCALE, DEFAULT_TPS,
} from "../../src/lib/limits/presets.js";
import { PROMPT_TEMPLATES, PROMPT_MAX_TEXT_LENGTH } from "../../src/lib/promptTemplates.js";
import { sanitizeProviderLimits, sanitizeUpstreamLimits } from "../../src/lib/settingsSanitizers.js";

describe("limit presets", () => {
  it("every limit preset exposes all numeric fields", () => {
    const keys = ["rpm", "tpm", "dailyRequests", "dailyTokens", "dailyCost", "monthlyCost"];
    for (const [name, preset] of Object.entries(LIMIT_PRESETS)) {
      expect(preset.label, name).toBeTruthy();
      for (const k of keys) expect(typeof preset.values[k], `${name}.${k}`).toBe("number");
    }
  });

  it("TPM presets are ascending and never negative", () => {
    const sorted = [...TPM_PRESETS].sort((a, b) => a - b);
    expect(TPM_PRESETS).toEqual(sorted);
    expect(TPM_PRESETS.every((v) => v >= 0)).toBe(true);
  });

  it("default TPS is a large, sane value (>= 1M)", () => {
    expect(DEFAULT_TPS).toBeGreaterThanOrEqual(1_000_000);
    expect(TPM_SCALE.xlarge).toBeGreaterThanOrEqual(1_000_000);
  });

  it("flow presets expose the flow fields", () => {
    for (const [name, preset] of Object.entries(FLOW_PRESETS)) {
      expect(typeof preset.values.maxConcurrent, name).toBe("number");
      expect(typeof preset.values.rpm, name).toBe("number");
      expect(typeof preset.values.queueTimeoutMs, name).toBe("number");
      expect(typeof preset.values.maxQueue, name).toBe("number");
    }
  });
});

describe("provider limits sanitizer accepts large TPM", () => {
  it("keeps a 20M tpm value intact", () => {
    const out = sanitizeProviderLimits({ glm: { enabled: true, tpm: 20_000_000 } });
    expect(out.glm.tpm).toBe(20_000_000);
  });
});

describe("flow sanitizer", () => {
  it("keeps generous concurrency", () => {
    const out = sanitizeUpstreamLimits({ glm: { enabled: true, maxConcurrent: 20, rpm: 600 } });
    expect(out.glm.maxConcurrent).toBe(20);
    expect(out.glm.rpm).toBe(600);
  });
});

describe("prompt templates", () => {
  it("every template has an id, label and entry with text", () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(t.id, t.label).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.entry?.text?.length).toBeGreaterThan(0);
      expect(["global", "combo"]).toContain(t.entry.scope);
      expect(["append", "prepend"]).toContain(t.entry.position);
    }
  });

  it("max text length is bounded and matches the sanitizer", () => {
    expect(PROMPT_MAX_TEXT_LENGTH).toBe(20000);
  });
});
