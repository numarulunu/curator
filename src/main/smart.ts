import type { SidecarLike } from "./apply";

export type SmartPhase = "models" | "features" | "cluster" | "grade";

export interface SmartProgress {
  phase: SmartPhase;
  processed?: number;
  total?: number;
  model?: string;
}

export interface SmartResult {
  clusters_created: number;
  files_clustered: number;
  clusters_graded: number;
  features_processed: number;
}

export async function runSmartDistillation(
  sidecar: SidecarLike,
  root: string,
  opts: { onProgress?: (p: SmartProgress) => void; batchSize?: number } = {},
): Promise<SmartResult> {
  const emit = opts.onProgress ?? (() => {});
  const batchSize = opts.batchSize ?? 200;

  emit({ phase: "models" });
  await sidecar.call<{ ready: string[]; downloaded: string[] }>("downloadModels", {});

  emit({ phase: "features", processed: 0 });
  let featuresProcessed = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const result = await sidecar.call<{ processed: number; skipped: number; errors: unknown[] }>("extractFeatures", {
      root,
      batch_size: batchSize,
    });
    featuresProcessed += result.processed;
    emit({ phase: "features", processed: featuresProcessed });
    if (result.processed === 0) break;
  }

  emit({ phase: "cluster" });
  const cluster = await sidecar.call<{ clusters_created: number; files_clustered: number }>("clusterSmart", { root });

  emit({ phase: "grade" });
  const grade = await sidecar.call<{ clusters_graded: number }>("gradeClusters", { root });

  return {
    clusters_created: cluster.clusters_created,
    files_clustered: cluster.files_clustered,
    clusters_graded: grade.clusters_graded,
    features_processed: featuresProcessed,
  };
}
