import type { SidecarLike } from "./apply";
import type { AnalysisSettings } from "@shared/types";

export async function getAnalysisSettings(sidecar: SidecarLike): Promise<AnalysisSettings> {
  return sidecar.call<AnalysisSettings>("getAnalysisSettings", {});
}

export async function saveAnalysisSettings(sidecar: SidecarLike, settings: AnalysisSettings): Promise<void> {
  await sidecar.call<{ ok: true }>("saveAnalysisSettings", { settings });
}
