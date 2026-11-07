import { describe, expect, it } from "vitest";
import { formatCount, formatNumber, parseCount } from "../../src/lib/limits/format.js";

describe("formatCount", () => {
  it("renders big token counts compactly", () => {
    expect(formatCount(0)).toBe("unlimited");
    expect(formatCount(250_000)).toBe("250k");
    expect(formatCount(1_000_000)).toBe("1M");
    expect(formatCount(5_000_000)).toBe("5M");
    expect(formatCount(20_000_000)).toBe("20M");
    expect(formatCount(1_500_000_000)).toBe("1.5B");
  });

  it("handles negatives/garbage as unlimited", () => {
    expect(formatCount(-5)).toBe("unlimited");
    expect(formatCount("abc")).toBe("unlimited");
  });
});

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("parseCount", () => {
  it("parses numbers and clamps invalid to 0", () => {
    expect(parseCount("")).toBe(0);
    expect(parseCount("20000000")).toBe(20_000_000);
    expect(parseCount(-3)).toBe(0);
    expect(parseCount("x")).toBe(0);
  });
});
