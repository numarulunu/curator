import { useEffect, useState } from "react";

interface Progress {
  kind: string;
  phase?: string;
  model?: string;
  processed?: number;
}

export function ModelDownloadBanner(): JSX.Element | null {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    const off = window.curator.onEvent((evt) => {
      if (evt.kind === "smart-progress") setProgress(evt as Progress);
    });
    return off;
  }, []);

  if (!progress?.phase) return null;
  return (
    <div className="smart-banner">
      <span>Smart Distill</span>
      <span>{progress.phase}</span>
      {progress.model ? <span>{progress.model}</span> : null}
      {typeof progress.processed === "number" ? <span>{progress.processed} processed</span> : null}
    </div>
  );
}
