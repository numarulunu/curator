import { useEffect, useState } from "react";
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

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function AnalysisProgressBar({ progress, running, onCancel }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (running && startedAt === null) setStartedAt(Date.now());
    if (!running) setStartedAt(null);
  }, [running, startedAt]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!progress) return null;
  const label = PHASE_LABEL[progress.phase] ?? progress.phase;
  const pct =
    progress.total && progress.processed !== undefined
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : null;

  const elapsedS = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  let etaText = "";
  if (running && pct !== null && pct > 0 && pct < 100 && elapsedS > 3) {
    const totalEstS = (elapsedS / pct) * 100;
    const remainingS = Math.max(0, totalEstS - elapsedS);
    etaText = ` · ETA ${formatElapsed(Math.round(remainingS))}`;
  }

  return (
    <div style={wrapStyle} aria-label="Analysis progress">
      <div style={lineStyle}>
        <span>{label}</span>
        <span style={countStyle}>
          {progress.processed !== undefined ? (
            <>
              {progress.processed.toLocaleString()}
              {progress.total ? ` / ${progress.total.toLocaleString()}` : ""}
            </>
          ) : null}
          {running ? ` · ${formatElapsed(elapsedS)}${etaText}` : ""}
        </span>
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
