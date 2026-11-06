import { describe, expect, it } from "vitest";
import { selectInjections, applyInjections, PROMPT_SCOPE, PROMPT_POSITION } from "../../open-sse/rtk/promptInjections.js";

const g = (over = {}) => ({ id: "x", text: "hello", enabled: true, scope: "global", ...over });

describe("selectInjections", () => {
  it("returns [] for non-arrays", () => {
    expect(selectInjections(null, "c")).toEqual([]);
    expect(selectInjections(undefined, null)).toEqual([]);
  });

  it("drops disabled and empty-text entries", () => {
    const out = selectInjections([g({ enabled: false }), g({ text: "   " }), g({ text: "keep" })], null);
    expect(out.map((e) => e.text)).toEqual(["keep"]);
  });

  it("includes every global entry regardless of combo", () => {
    const out = selectInjections([g({ text: "a" }), g({ text: "b" })], "anycombo");
    expect(out).toHaveLength(2);
  });

  it("includes a combo entry only for its combo (case-insensitive)", () => {
    const injections = [
      g({ text: "global-rule" }),
      g({ text: "coding-rule", scope: "combo", comboName: "Coding" }),
    ];
    expect(selectInjections(injections, "coding").map((e) => e.text)).toEqual(["global-rule", "coding-rule"]);
    expect(selectInjections(injections, "support").map((e) => e.text)).toEqual(["global-rule"]);
    expect(selectInjections(injections, null).map((e) => e.text)).toEqual(["global-rule"]);
  });

  it("orders prepends first (by priority desc) then appends (by priority desc)", () => {
    const injections = [
      g({ text: "a1", position: "append", priority: 1 }),
      g({ text: "p1", position: "prepend", priority: 1 }),
      g({ text: "a5", position: "append", priority: 5 }),
      g({ text: "p9", position: "prepend", priority: 9 }),
    ];
    const out = selectInjections(injections, null).map((e) => e.text);
    expect(out).toEqual(["p9", "p1", "a5", "a1"]);
  });

  it("defaults scope to global and position to append", () => {
    const out = selectInjections([{ text: "x", enabled: true }], null);
    expect(out[0].scope).toBe(PROMPT_SCOPE.GLOBAL);
    expect(out[0].position).toBe(PROMPT_POSITION.APPEND);
  });
});

describe("applyInjections", () => {
  it("appends to an existing OpenAI system message", () => {
    const body = { messages: [{ role: "system", content: "base" }, { role: "user", content: "hi" }] };
    const n = applyInjections(body, "openai", [{ text: "EXTRA", position: "append" }]);
    expect(n).toBe(1);
    expect(body.messages[0].content).toContain("base");
    expect(body.messages[0].content).toContain("EXTRA");
    expect(body.messages[0].content.indexOf("base")).toBeLessThan(body.messages[0].content.indexOf("EXTRA"));
  });

  it("prepends before the existing OpenAI system content", () => {
    const body = { messages: [{ role: "system", content: "base" }] };
    applyInjections(body, "openai", [{ text: "PRE", position: "prepend" }]);
    expect(body.messages[0].content.indexOf("PRE")).toBeLessThan(body.messages[0].content.indexOf("base"));
  });

  it("appends and prepends into a Claude system string", () => {
    const body = { system: "base" };
    applyInjections(body, "claude", [
      { text: "PRE", position: "prepend" },
      { text: "POST", position: "append" },
    ]);
    expect(body.system.startsWith("PRE")).toBe(true);
    expect(body.system.endsWith("POST")).toBe(true);
  });

  it("creates a system message when none exists", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    applyInjections(body, "openai", [{ text: "SYS", position: "append" }]);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe("SYS");
  });

  it("is idempotent (does not duplicate the same instruction)", () => {
    const body = { messages: [{ role: "system", content: "base" }] };
    applyInjections(body, "openai", [{ text: "ONCE", position: "append" }]);
    applyInjections(body, "openai", [{ text: "ONCE", position: "append" }]);
    const count = (body.messages[0].content.match(/ONCE/g) || []).length;
    expect(count).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(applyInjections({ messages: [] }, "openai", [])).toBe(0);
  });
});
