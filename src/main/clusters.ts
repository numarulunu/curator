import type { ApplyResult, ClusterListing } from "@shared/types";
import type { SidecarLike } from "./apply";

export async function listClusters(sidecar: SidecarLike, root: string | null): Promise<ClusterListing> {
  return sidecar.call<ClusterListing>("listClusters", { root });
}

export async function setClusterWinner(sidecar: SidecarLike, clusterId: number, fileId: number): Promise<void> {
  await sidecar.call<{ ok: true }>("setClusterWinner", { cluster_id: clusterId, file_id: fileId });
}

export async function applyCluster(sidecar: SidecarLike, clusterId: number, archiveRoot: string): Promise<ApplyResult> {
  return sidecar.call<ApplyResult>("applyCluster", { cluster_id: clusterId, archive_root: archiveRoot });
}
