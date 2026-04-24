// src/renderer/components/AnalysisProgressBar.tsx
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

export function AnalysisProgressBar({ progress, running, onCancel }: Props) {
  if (!progress) return null;
  const label = PHASE_LABEL[progress.phase] ?? progress.phase;
  const pct =
    progress.total && progress.processed !== undefined
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : null;
  return (
    <div className="analysis-progress">
      <div className="phase-line">
        <span>{label}</span>
        {progress.processed !== undefined && (
          <span>
            {progress.processed}
            {progress.total ? ` / ${progress.total}` : ""}
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="bar">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {running && (
        <button data-testid="analysis-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
