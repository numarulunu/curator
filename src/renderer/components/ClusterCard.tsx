import type { Cluster, ClusterMember } from "@shared/types";

interface Props {
  cluster: Cluster;
  onSetWinner: (clusterId: number, fileId: number) => void;
  onApply: (clusterId: number) => void;
  applying: boolean;
}

function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function Member({ m, isWinner, onPromote }: { m: ClusterMember; isWinner: boolean; onPromote: () => void }): JSX.Element {
  return (
    <div data-testid={`cluster-member-${m.file_id}`} className="cluster-member">
      <img src={fileUrl(m.path)} alt={m.path} loading="lazy" />
      <div className="member-meta">
        <span className="member-path">{basename(m.path)}</span>
        <span className="member-dims">{m.width ?? "?"}x{m.height ?? "?"}</span>
        <span className="member-score">score {m.score.toFixed(3)}</span>
        {isWinner ? (
          <span className="winner-badge">Winner</span>
        ) : (
          <button type="button" data-testid={`promote-${m.file_id}`} onClick={onPromote}>
            Promote
          </button>
        )}
      </div>
    </div>
  );
}

export function ClusterCard({ cluster, onSetWinner, onApply, applying }: Props): JSX.Element {
  const applied = cluster.applied_session_id !== null;
  const count = (cluster.winner ? 1 : 0) + cluster.losers.length;
  return (
    <section className="cluster-card">
      <header>
        <h3>Cluster #{cluster.id}</h3>
        <span>{cluster.method} | confidence {cluster.confidence.toFixed(2)} | {count} photos</span>
      </header>
      <div className="cluster-members">
        {cluster.winner ? <Member m={cluster.winner} isWinner onPromote={() => {}} /> : null}
        {cluster.losers.map((m) => (
          <Member key={m.file_id} m={m} isWinner={false} onPromote={() => onSetWinner(cluster.id, m.file_id)} />
        ))}
      </div>
      <footer>
        <button
          type="button"
          data-testid={`apply-cluster-${cluster.id}`}
          disabled={applied || applying}
          onClick={() => onApply(cluster.id)}
        >
          {applied ? "Applied" : applying ? "Applying..." : "Quarantine losers"}
        </button>
      </footer>
    </section>
  );
}
