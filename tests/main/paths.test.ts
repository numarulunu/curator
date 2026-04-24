import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCuratorStateDir } from "@main/paths";
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
});
