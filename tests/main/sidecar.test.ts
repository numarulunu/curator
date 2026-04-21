import { describe, it, expect, afterEach } from "vitest";
import { Sidecar } from "@main/sidecar";
import { resolve } from "node:path";

describe("Sidecar", () => {
  let sc: Sidecar | null = null;
  afterEach(async () => { if (sc) await sc.close(); sc = null; });

  it("ping returns pong", async () => {
    sc = new Sidecar({
      python: resolve("python/.venv/Scripts/python.exe"),
      cwd: resolve("python"),
      args: ["-m", "curator"],
    });
    await sc.start();
    const result = await sc.call<{ pong: boolean }>("ping", {});
    expect(result.pong).toBe(true);
  });

  it("unknown method rejects with rpc error", async () => {
    sc = new Sidecar({
      python: resolve("python/.venv/Scripts/python.exe"),
      cwd: resolve("python"),
      args: ["-m", "curator"],
    });
    await sc.start();
    await expect(sc.call("nope", {})).rejects.toThrow(/Method not found/);
  });
});
