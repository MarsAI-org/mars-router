// Launcher sanity: the production start script and the service command must
// read PORT (default 20128) instead of a hardcoded port, and forward it to the
// server. Static checks only.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const start = fs.readFileSync(path.join(root, "scripts", "start.mjs"), "utf8");
const cmd = fs.readFileSync(path.join(root, "scripts", "mars-router.mjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("scripts/start.mjs", () => {
  it("is the package start script", () => {
    expect(pkg.scripts.start).toContain("scripts/start.mjs");
  });

  it("reads PORT with a 20128 default and forwards it", () => {
    expect(start).toContain("process.env.PORT");
    expect(start).toContain("20128");
    expect(start).toContain("--port");
  });

  it("no longer hardcodes the old 20127 dev port in start", () => {
    expect(pkg.scripts.start).not.toContain("20127");
  });
});

describe("scripts/mars-router.mjs", () => {
  it("supports start/stop/status/logs", () => {
    for (const sub of ["start", "stop", "status", "logs"]) {
      expect(cmd).toContain(sub);
    }
  });

  it("defaults to port 20128", () => {
    expect(cmd).toContain("20128");
  });
});

describe("package identity", () => {
  it("is named mars-router-app", () => {
    expect(pkg.name).toBe("mars-router-app");
  });
});
