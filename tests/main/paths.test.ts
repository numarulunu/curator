import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCuratorStateDir, resolveBinaryPath } from "@main/paths";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("paths", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "curator-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("resolves state dir under LOCALAPPDATA/Curator and creates it", () => {
    const out = resolveCuratorStateDir(tmp);
    expect(out).toBe(join(tmp, "Curator"));
  });

  it("returns bundled binary path when packaged", () => {
    const p = resolveBinaryPath("/fake/resources", "exiftool.exe");
    expect(p).toBe(join("/fake/resources", "bin", "exiftool.exe"));
  });
});
