import { afterEach, describe, expect, test, vi } from "vitest";
import { loadStoredArchivePrefs, saveStoredArchivePrefs } from "../../src/renderer/state/ArchiveContext";

describe("archive folder persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads stored input and output folders", () => {
    const storage = {
      getItem: vi.fn((key: string) => {
        if (key === "curator.archiveRoot") return "D:/input";
        if (key === "curator.outputRoot") return "D:/output";
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { __CURATOR_E2E_ROOT__: null });

    expect(loadStoredArchivePrefs()).toEqual({ archiveRoot: "D:/input", outputRoot: "D:/output" });
  });

  test("persists both input and output folders", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);

    saveStoredArchivePrefs({ archiveRoot: "D:/input", outputRoot: "D:/output" });

    expect(storage.setItem).toHaveBeenCalledWith("curator.archiveRoot", "D:/input");
    expect(storage.setItem).toHaveBeenCalledWith("curator.outputRoot", "D:/output");
  });
});
