import type { SidecarLike } from "./apply";
import type {
  AnalysisPhase, AnalysisProgress, AnalysisResult, AnalysisSettings, PresetName,
} from "@shared/types";

// Mirrors python/curator/settings.py _PRESETS — keep in sync.
const PRESETS: Record<Exclude<PresetName, "custom">, Record<string, number>> = {
  safe:       { phash_hamming:  5, clip_cosine: 0.93, exif_time_s:  900, gps_m:  80, min_confidence: 0.92 },
  balanced:   { phash_hamming:  8, clip_cosine: 0.90, exif_time_s: 1800, gps_m: 150, min_confidence: 0.88 },
  aggressive: { phash_hamming: 12, clip_cosine: 0.85, exif_time_s: 3600, gps_m: 300, min_confidence: 0.82 },
};

export function resolveThresholds(s: AnalysisSettings): Record<string, number> {
  if (s.preset === "custom") {
    return { ...PRESETS.balanced, ...s.preset_custom };
  }
  return { ...PRESETS[s.preset] };
}

export async function runAnalysis(
  sidecar: SidecarLike,
  archiveRoot: string,
  settings: AnalysisSettings,
  opts: { onProgress?: (p: AnalysisProgress) => void; batchSize?: number } = {},
): Promise<AnalysisResult> {
  const emit = opts.onProgress ?? (() => {});
  const batchSize = opts.batchSize ?? 200;

  // Clear any sticky cancel flag from a previous run so this analysis isn't
  // immediately aborted by a stale request_cancel().
  await sidecar.call("resetCancel", {});

  emit({ phase: "scan" as AnalysisPhase });
  const scan = await sidecar.call<{ scanned: number; root: string }>("scan", { root: archiveRoot });

  emit({ phase: "hash" as AnalysisPhase });
  const hash = await sidecar.call<{ hashed: number; skipped: number }>("hashAll", { root: archiveRoot });

  emit({ phase: "dates" as AnalysisPhase });
  await sidecar.call<{ resolved: number }>("resolveDates", { root: archiveRoot });

  let featuresProcessed = 0;
  let clustersCreated = 0;

  if (settings.similar_photo_review && settings.ai_mode !== "off") {
    emit({ phase: "features" as AnalysisPhase, note: "downloading models" });
    await sidecar.call("downloadModels", {});

    const MAX_FEATURE_BATCHES = 10_000;
    emit({ phase: "features" as AnalysisPhase, processed: 0 });
    let drained = false;
    for (let guard = 0; guard < MAX_FEATURE_BATCHES; guard++) {
      const r = await sidecar.call<{ processed: number; cancelled?: boolean }>(
        "extractFeatures",
        { root: archiveRoot, batch_size: batchSize, ai_mode: settings.ai_mode },
      );
      featuresProcessed += r.processed;
      emit({ phase: "features" as AnalysisPhase, processed: featuresProcessed });
      if (r.cancelled) {
        drained = true;
        return {
          scanned: scan.scanned,
          hashed: hash.hashed,
          clusters_created: 0,
          features_processed: featuresProcessed,
          cancelled: true,
        };
      }
      if (r.processed === 0) { drained = true; break; }
    }
    if (!drained) {
      console.warn(`Feature extraction hit MAX_FEATURE_BATCHES=${MAX_FEATURE_BATCHES} without draining; archive may exceed supported size.`);
    }

    const thresholds = resolveThresholds(settings);
    emit({ phase: "cluster" as AnalysisPhase });
    const cluster = await sidecar.call<{ clusters_created: number; files_clustered: number }>(
      "clusterSmart",
      { root: archiveRoot, thresholds },
    );
    clustersCreated = cluster.clusters_created;

    emit({ phase: "grade" as AnalysisPhase });
    await sidecar.call<{ clusters_graded: number }>("gradeClusters", { root: archiveRoot });
  }

  emit({ phase: "done" as AnalysisPhase });
  return {
    scanned: scan.scanned,
    hashed: hash.hashed,
    clusters_created: clustersCreated,
    features_processed: featuresProcessed,
    cancelled: false,
  };
}
