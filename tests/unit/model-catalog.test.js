import { describe, expect, it } from "vitest";
import { applyCatalogOverrides, normalizeCatalog } from "../../src/lib/modelCatalog.js";

const models = [
  { id: "cc/claude-opus", object: "model", owned_by: "cc" },
  { id: "glm/glm-5", object: "model", owned_by: "glm" },
  { id: "kr/claude-sonnet", object: "model", owned_by: "kr" },
];

describe("normalizeCatalog", () => {
  it("returns defaults for garbage", () => {
    expect(normalizeCatalog(null)).toEqual({ hidden: [], displayNames: {}, order: [] });
    expect(normalizeCatalog([])).toEqual({ hidden: [], displayNames: {}, order: [] });
  });

  it("trims, de-dupes and filters non-strings", () => {
    const c = normalizeCatalog({ hidden: [" a ", "a", 5, ""], order: ["x", "x", 2], displayNames: { " cc/m ": " Nice ", bad: 7 } });
    expect(c.hidden).toEqual(["a"]);
    expect(c.order).toEqual(["x"]);
    expect(c.displayNames).toEqual({ "cc/m": "Nice" });
  });
});

describe("applyCatalogOverrides", () => {
  it("hides listed ids", () => {
    const out = applyCatalogOverrides(models, { hidden: ["glm/glm-5"] });
    expect(out.map((m) => m.id)).toEqual(["cc/claude-opus", "kr/claude-sonnet"]);
  });

  it("renames without changing the routable id", () => {
    const out = applyCatalogOverrides(models, { displayNames: { "glm/glm-5": "GLM 5 (cheap)" } });
    const glm = out.find((m) => m.id === "glm/glm-5");
    expect(glm.name).toBe("GLM 5 (cheap)");
    expect(glm.id).toBe("glm/glm-5");
  });

  it("reorders listed ids to the front in the given order", () => {
    const out = applyCatalogOverrides(models, { order: ["kr/claude-sonnet", "cc/claude-opus"] });
    expect(out.map((m) => m.id)).toEqual(["kr/claude-sonnet", "cc/claude-opus", "glm/glm-5"]);
  });

  it("never mutates the original array", () => {
    const before = JSON.stringify(models);
    applyCatalogOverrides(models, { hidden: ["glm/glm-5"], displayNames: { "cc/claude-opus": "X" } });
    expect(JSON.stringify(models)).toBe(before);
  });

  it("is a no-op for a default catalog", () => {
    const out = applyCatalogOverrides(models, {});
    expect(out.map((m) => m.id)).toEqual(models.map((m) => m.id));
  });

  it("ignores malformed entries safely", () => {
    const out = applyCatalogOverrides([{ id: "a" }, null, { noId: true }], { hidden: [] });
    expect(out.map((m) => m.id)).toEqual(["a"]);
  });
});
