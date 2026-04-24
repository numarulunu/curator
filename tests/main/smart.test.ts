import { describe, expect, it, vi } from "vitest";
import type { SidecarLike } from "../../src/main/apply";
import { runSmartDistillation } from "../../src/main/smart";

describe("runSmartDistillation", () => {
  it("calls model, feature, cluster, and grade sidecar methods in order", async () => {
    const calls: string[] = [];
    const call = vi.fn(async (method: string, _params?: unknown): Promise<unknown> => {
        calls.push(method);
        if (method === "downloadModels") return { ready: ["clip_vit_b32", "yunet_face", "nima_mobilenet"], downloaded: [] };
        if (method === "extractFeatures") return { processed: 0, skipped: 0, errors: [] };
        if (method === "clusterSmart") return { clusters_created: 2, files_clustered: 5 };
        if (method === "gradeClusters") return { clusters_graded: 2 };
        return {};
      });
    const sidecar: SidecarLike = {
      call: <T>(method: string, params: unknown) => call(method, params) as Promise<T>,
    };
    const progress: string[] = [];

    const result = await runSmartDistillation(sidecar, "C:/fake", { onProgress: (p) => progress.push(p.phase) });

    expect(calls[0]).toBe("downloadModels");
    expect(calls).toContain("extractFeatures");
    expect(calls[calls.length - 2]).toBe("clusterSmart");
    expect(calls[calls.length - 1]).toBe("gradeClusters");
    expect(result.clusters_created).toBe(2);
    expect(progress).toContain("models");
    expect(progress).toContain("features");
    expect(progress).toContain("cluster");
    expect(progress).toContain("grade");
  });

  it("continues feature extraction after an error-only batch", async () => {
    const calls: string[] = [];
    let featureCalls = 0;
    const call = vi.fn(async (method: string, _params?: unknown): Promise<unknown> => {
      calls.push(method);
      if (method === "downloadModels") return { ready: ["clip_vit_b32", "yunet_face", "nima_mobilenet"], downloaded: [] };
      if (method === "extractFeatures") {
        featureCalls += 1;
        if (featureCalls === 1) return { processed: 0, skipped: 0, errors: [{ file_id: 1, error: "decode" }] };
        if (featureCalls === 2) return { processed: 1, skipped: 0, errors: [] };
        return { processed: 0, skipped: 2, errors: [] };
      }
      if (method === "clusterSmart") return { clusters_created: 0, files_clustered: 0 };
      if (method === "gradeClusters") return { clusters_graded: 0 };
      return {};
    });
    const sidecar: SidecarLike = {
      call: <T>(method: string, params: unknown) => call(method, params) as Promise<T>,
    };

    const result = await runSmartDistillation(sidecar, "C:/fake", { batchSize: 1 });

    expect(calls.filter((method) => method === "extractFeatures")).toHaveLength(3);
    expect(result.features_processed).toBe(1);
  });
});
