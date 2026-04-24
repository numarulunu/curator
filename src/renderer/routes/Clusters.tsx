import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Cluster } from "@shared/types";
import { ClusterCard } from "../components/ClusterCard";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

export function Clusters(): JSX.Element {
  const { archiveRoot } = useArchive();
  const { push } = useToast();
  const navigate = useNavigate();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const result = await window.curator.listClusters(archiveRoot);
      setClusters(result.clusters);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [archiveRoot]);

  async function onSetWinner(clusterId: number, fileId: number): Promise<void> {
    await window.curator.setClusterWinner(clusterId, fileId);
    await refresh();
  }

  async function onApply(clusterId: number): Promise<void> {
    if (!archiveRoot) return;
    setApplyingId(clusterId);
    try {
      const result = await window.curator.applyCluster(clusterId, archiveRoot);
      push({ kind: "success", title: "Cluster applied", message: `${result.ok} loser${result.ok === 1 ? "" : "s"} quarantined.` });
      await refresh();
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <main className="clusters-page">
      <header className="clusters-header">
        <button type="button" onClick={() => navigate("/")}>Back</button>
        <div>
          <h2>Near-duplicate clusters</h2>
          <span>{loading ? "Loading" : `${clusters.length} cluster${clusters.length === 1 ? "" : "s"}`}</span>
        </div>
      </header>
      {clusters.length === 0 ? (
        <div className="clusters-empty">No clusters yet.</div>
      ) : (
        <div className="clusters-list">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              onSetWinner={(clusterId, fileId) => void onSetWinner(clusterId, fileId)}
              onApply={(clusterId) => void onApply(clusterId)}
              applying={applyingId === cluster.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}
