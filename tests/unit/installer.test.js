// Installer sanity: the shipped scripts must reference the right repo, expose
// the documented flags, and stay in sync on the default port/dir. These are
// static checks — nothing is downloaded or executed.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sh = fs.readFileSync(path.join(root, "install.sh"), "utf8");
const ps = fs.readFileSync(path.join(root, "install.ps1"), "utf8");

describe("install.sh", () => {
  it("targets the Mars Router repo", () => {
    expect(sh).toContain("MarsAI-org/mars-router");
  });

  it("documents the supported flags", () => {
    for (const flag of ["--docker", "--native", "--dir", "--port", "--ref", "--no-start"]) {
      expect(sh).toContain(flag);
    }
  });

  it("uses the app default port and dir", () => {
    expect(sh).toContain("20128");
    expect(sh).toContain(".mars-router");
  });

  it("starts with a POSIX sh shebang and is defensive", () => {
    expect(sh.startsWith("#!/bin/sh")).toBe(true);
    expect(sh).toContain("set -e");
  });

  it("checks for a Node.js version floor", () => {
    expect(sh).toMatch(/REQUIRED_NODE_MAJOR=\d+/);
  });

  it("installs a mars-router command and starts through it", () => {
    expect(sh).toContain("mars-router");
    expect(sh).toContain("scripts/mars-router.mjs");
    expect(sh).toContain(".local/bin");
  });
});

describe("install.ps1", () => {
  it("targets the Mars Router repo", () => {
    expect(ps).toContain("MarsAI-org/mars-router");
  });

  it("exposes the Docker switch, dir, port and ref params", () => {
    expect(ps).toContain("[switch]$Docker");
    expect(ps).toContain("[string]$Dir");
    expect(ps).toContain("[int]$Port");
    expect(ps).toContain("[string]$Ref");
  });

  it("uses the app default port", () => {
    expect(ps).toContain("20128");
  });

  it("has balanced braces", () => {
    const open = (ps.match(/\{/g) || []).length;
    const close = (ps.match(/\}/g) || []).length;
    expect(open).toBe(close);
  });
});
