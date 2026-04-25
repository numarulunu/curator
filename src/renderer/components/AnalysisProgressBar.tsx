import type { AnalysisProgress } from "@shared/types";

interface Props {
  progress: AnalysisProgress | null;
  running: boolean;
  onCancel: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  scan: "Scanning files",
  hash: "Hashing",
  dates: "Resolving dates",
  features: "Analyzing features",
  cluster: "Grouping photos",
  grade: "Picking best shots",
  done: "Done",
};

const wrapStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  borderBottom: "1px solid var(--border)",
  padding: "10px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const lineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  color: "var(--text)",
};

const countStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 11,
  color: "var(--text-muted)",
};

const trackStyle: React.CSSProperties = {
  height: 4,
  background: "var(--border)",
  borderRadius: 2,
  overflow: "hidden",
};

const fillStyle = (pct: number): React.CSSProperties => ({
  width: `${pct}%`,
  height: "100%",
  background: "var(--accent)",
  transition: "width 200ms linear",
});

const cancelStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "transparent",
  color: "var(--error)",
  border: "1px solid var(--error)",
  borderRadius: 3,
  padding: "3px 10px",
  fontSize: 11,
  cursor: "pointer",
};

export function AnalysisProgressBar({ progress, running, onCancel }: Props) {
  if (!progress) return null;
  const label = PHASE_LABEL[progress.phase] ?? progress.phase;
  const pct =
    progress.total && progress.processed !== undefined
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : null;
  return (
    <div style={wrapStyle} aria-label="Analysis progress">
      <div style={lineStyle}>
        <span>{label}</span>
        {progress.processed !== undefined && (
          <span style={countStyle}>
            {progress.processed}
            {progress.total ? ` / ${progress.total}` : ""}
          </span>
        )}
      </div>
      {pct !== null && (
        <div style={trackStyle}>
          <div style={fillStyle(pct)} />
        </div>
      )}
      {running && (
        <button data-testid="analysis-cancel" onClick={onCancel} style={cancelStyle}>
          Cancel
        </button>
      )}
    </div>
  );
}
