import { describe, expect, it, vi } from "vitest";
import { runAnalysis } from "../../src/main/analysis";
import type { AnalysisSettings } from "../../src/shared/types";

function fakeSidecar(handlers: Record<string, any>) {
  return {
    call: vi.fn(async (method: string, params: any) => {
      const h = handlers[method];
      if (!h) throw new Error(`unhandled: ${method}`);
      return typeof h === "function" ? h(params) : h;
    }),
  };
}

const BASE_SETTINGS: AnalysisSettings = {
  similar_photo_review: false,
  ai_mode: "off",
  preset: "balanced",
  preset_custom: {},
  profile: "balanced",
  profile_custom: {},
};

describe("runAnalysis", () => {
  it("skips similar-photo pipeline when toggle is off", async () => {
    const sidecar = fakeSidecar({
      resetCancel: { ok: true },
      scan: { scanned: 10, root: "C:/x" },
      hashAll: { hashed: 10, skipped: 0 },
      resolveDates: { resolved: 10 },
    });
    const result = await runAnalysis(sidecar as any, "C:/x", BASE_SETTINGS);
    expect(sidecar.call).not.toHaveBeenCalledWith("extractFeatures", expect.anything());
    expect(sidecar.call).not.toHaveBeenCalledWith("clusterSmart", expect.anything());
    expect(result.clusters_created).toBe(0);
    expect(result.scanned).toBe(10);
  });

  it("runs full pipeline when toggle is on + Full mode", async () => {
    const settings: AnalysisSettings = { ...BASE_SETTINGS, similar_photo_review: true, ai_mode: "full" };
    const phases: string[] = [];
    const sidecar = fakeSidecar({
      resetCancel: { ok: true },
      scan: { scanned: 20, root: "C:/y" },
      hashAll: { hashed: 20, skipped: 0 },
      resolveDates: { resolved: 20 },
      downloadModels: { ready: [], downloaded: [] },
      extractFeatures: (p: any) => { phases.push(`extract:${p.ai_mode}`); return { processed: 0, skipped: 0, errors: [] }; },
      clusterSmart: (p: any) => { phases.push(`cluster:${JSON.stringify(p.thresholds)}`); return { clusters_created: 3, files_clustered: 9 }; },
      gradeClusters: () => { phases.push("grade"); return { clusters_graded: 3 }; },
    });
    const result = await runAnalysis(sidecar as any, "C:/y", settings);
    expect(result.clusters_created).toBe(3);
    expect(phases[0]).toBe("extract:full");
    expect(phases).toContain("grade");
  });

  it("skips model download when ai_mode is off even with toggle on", async () => {
    const settings: AnalysisSettings = { ...BASE_SETTINGS, similar_photo_review: true, ai_mode: "off" };
    const sidecar = fakeSidecar({
      resetCancel: { ok: true },
      scan: { scanned: 1, root: "C:/z" },
      hashAll: { hashed: 1, skipped: 0 },
      resolveDates: { resolved: 1 },
    });
    await runAnalysis(sidecar as any, "C:/z", settings);
    expect(sidecar.call).not.toHaveBeenCalledWith("downloadModels", expect.anything());
    expect(sidecar.call).not.toHaveBeenCalledWith("clusterSmart", expect.anything());
  });

  it("uses preset thresholds in clusterSmart call", async () => {
    const settings: AnalysisSettings = { ...BASE_SETTINGS, similar_photo_review: true, ai_mode: "lite", preset: "safe" };
    let clusterParams: any = null;
    const sidecar = fakeSidecar({
      resetCancel: { ok: true },
      scan: { scanned: 1, root: "C:/q" }, hashAll: { hashed: 1, skipped: 0 }, resolveDates: { resolved: 1 },
      downloadModels: { ready: [], downloaded: [] },
      extractFeatures: { processed: 0, skipped: 0, errors: [] },
      clusterSmart: (p: any) => { clusterParams = p; return { clusters_created: 0, files_clustered: 0 }; },
      gradeClusters: { clusters_graded: 0 },
    });
    await runAnalysis(sidecar as any, "C:/q", settings);
    expect(clusterParams.thresholds.phash_hamming).toBe(5);
    expect(clusterParams.thresholds.clip_cosine).toBeCloseTo(0.93);
  });

  it("does not call getAnalysisSettings — settings come from caller", async () => {
    const sidecar = fakeSidecar({
      resetCancel: { ok: true },
      scan: { scanned: 1, root: "C:/r" },
      hashAll: { hashed: 1, skipped: 0 },
      resolveDates: { resolved: 1 },
    });
    await runAnalysis(sidecar as any, "C:/r", BASE_SETTINGS);
    expect(sidecar.call).not.toHaveBeenCalledWith("getAnalysisSettings", expect.anything());
  });
});
