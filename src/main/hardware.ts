import type { SidecarLike } from "./apply";
import type { HardwareProfile } from "@shared/types";

export async function detectHardware(sidecar: SidecarLike): Promise<HardwareProfile> {
  return sidecar.call<HardwareProfile>("detectHardware", {});
}
