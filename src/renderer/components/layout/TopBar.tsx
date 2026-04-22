import React, { useEffect, useState } from "react";
import { useArchive } from "../../state/ArchiveContext";
import { Button } from "../ui/Button";
import { cn } from "../../lib/cn";

export const TopBar: React.FC = () => {
  const { archiveRoot, pickArchive, setArchiveRoot } = useArchive();
  const [sidecarOk, setSidecarOk] = useState<"idle" | "ok" | "fail">("idle");
  const [sidecarLabel, setSidecarLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ok = await window.curator.ping();
        if (cancelled) return;
        setSidecarOk(ok ? "ok" : "fail");
        try {
          const version = await window.curator.getSidecarVersion();
          if (!cancelled) setSidecarLabel(`${version.sidecar} / Py ${version.python}`);
        } catch {
          if (!cancelled) setSidecarLabel(null);
        }
      } catch {
        if (!cancelled) setSidecarOk("fail");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusColor = sidecarOk === "ok" ? "bg-emerald-400" : sidecarOk === "fail" ? "bg-rose-500" : "bg-neutral-600";
  const statusLabel = sidecarOk === "ok" ? "Sidecar Online" : sidecarOk === "fail" ? "Sidecar Offline" : "Connecting";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-900 bg-neutral-950/80 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} aria-hidden />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-neutral-500">{statusLabel}</span>
          {sidecarLabel ? <span className="font-mono text-[10.5px] text-neutral-700">| {sidecarLabel}</span> : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {archiveRoot ? (
          <>
            <div className="hidden min-w-0 items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 md:flex">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">Archive</span>
              <span title={archiveRoot} className="max-w-[360px] truncate font-mono text-[12px] text-neutral-300">{archiveRoot}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void pickArchive()}>
              Change
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setArchiveRoot(null)}>
              Clear
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void pickArchive()}>
            Select Archive...
          </Button>
        )}
      </div>
    </header>
  );
};
