import { useEffect, useMemo, useState } from "react";
import type { AppVersion, ScanResult, SidecarVersion } from "@shared/types";
import { NoArchiveState } from "../components/layout/NoArchiveState";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { ErrorState } from "../components/ui/ErrorState";
import { MonoPath } from "../components/ui/MonoPath";
import { Stat } from "../components/ui/Stat";
import { useCuratorEvents } from "../hooks/useCuratorEvents";
import { stripIpcPrefix } from "../lib/curatorUi";
import { formatNumber } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

type Counts = { duplicates: number; misplaced: number; zeroByte: number };
type PipelineStep = "scan" | "hash" | "dates";

export function Dashboard(): JSX.Element {
  const { archiveRoot, pickArchive } = useArchive();
  const { push } = useToast();
  const event = useCuratorEvents();

  const [app, setApp] = useState<AppVersion | null>(null);
  const [sidecar, setSidecar] = useState<SidecarVersion | null>(null);
  const [ping, setPing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<PipelineStep | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ duplicates: 0, misplaced: 0, zeroByte: 0 });
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    window.curator.getVersion().then(setApp).catch(() => setApp(null));
    window.curator.getSidecarVersion().then(setSidecar).catch(() => setSidecar(null));
    window.curator.ping().then(setPing).catch(() => setPing(false));
  }, []);

  async function refreshCounts(): Promise<void> {
    if (!archiveRoot) return;
    setLoadingCounts(true);
    try {
      const [duplicates, misplaced, zeroByte] = await Promise.all([
        window.curator.duplicatesExact(),
        window.curator.listMisplaced(),
        window.curator.listZeroByte(),
      ]);
      setCounts({ duplicates: duplicates.length, misplaced: misplaced.length, zeroByte: zeroByte.length });
    } catch (err) {
      setError(stripIpcPrefix(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingCounts(false);
    }
  }

  useEffect(() => {
    if (!archiveRoot) return;
    void refreshCounts();
  }, [archiveRoot]);

  async function runStep(step: PipelineStep): Promise<void> {
    if (!archiveRoot && step === "scan") return;
    setBusy(step);
    setError(null);
    try {
      if (step === "scan") {
        setResult(await window.curator.scan(archiveRoot!));
      } else if (step === "hash") {
        await window.curator.hashAll();
      } else {
        await window.curator.resolveDates();
      }
      await refreshCounts();
      push({ kind: "success", title: `${step.toUpperCase()} complete` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: `${step.toUpperCase()} failed`, message });
    } finally {
      setBusy(null);
    }
  }

  const progressLabel = useMemo(() => {
    if (!event) return null;
    if (event.kind === "scan.progress" && typeof event.scanned === "number") return `Scanning ${event.scanned} files`;
    if (event.kind === "hash.progress" && typeof event.hashed === "number" && typeof event.total === "number") return `Hashing ${event.hashed} / ${event.total}`;
    return null;
  }, [event]);

  if (!archiveRoot) {
    return (
      <div>
        <PageHeader eyebrow="Overview" title="Dashboard" description="Curator analyzes one archive root at a time. Select a folder to start scanning and review the archive safely." />
        <NoArchiveState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Run the archive analysis pipeline, review findings, then build a reversible cleanup plan."
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => void pickArchive()}>Change Archive</Button>
            <Button variant="outline" size="md" onClick={() => void refreshCounts()} loading={loadingCounts}>Refresh Counts</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardBody><Stat label="Duplicate Clusters" value={formatNumber(counts.duplicates)} tone={counts.duplicates ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Misplaced Files" value={formatNumber(counts.misplaced)} tone={counts.misplaced ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Zero-byte Files" value={formatNumber(counts.zeroByte)} tone={counts.zeroByte ? "warn" : "muted"} /></CardBody></Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Archive Context</CardTitle>
            <Badge tone={ping ? "success" : ping === false ? "danger" : "muted"} uppercase>{ping ? "Online" : ping === false ? "Offline" : "Checking"}</Badge>
          </CardHeader>
          <CardBody className="space-y-3">
            <MonoPath path={archiveRoot} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">App</div><div className="mt-1 text-[12.5px] text-neutral-300">{app ? `Electron ${app.electron} / Node ${app.node}` : "-"}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Sidecar</div><div className="mt-1 text-[12.5px] text-neutral-300">{sidecar ? `${sidecar.sidecar} / Python ${sidecar.python}` : "-"}</div></div>
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Last Scan</div><div className="mt-1 text-[12.5px] text-neutral-300">{result ? `${result.scanned} files` : "Not run"}</div></div>
            </div>
            {progressLabel ? <div className="font-mono text-[12px] text-neutral-400">{progressLabel}</div> : null}
            {result ? <div className="text-[12px] text-neutral-500">Last scan root: {result.root}</div> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardBody className="space-y-2.5">
            <Button variant="outline" size="md" loading={busy === "scan"} disabled={busy !== null} onClick={() => void runStep("scan")} className="w-full justify-between"><span>Scan Archive</span><span className="font-mono text-[11px] text-neutral-500">walk + index</span></Button>
            <Button variant="outline" size="md" loading={busy === "hash"} disabled={busy !== null} onClick={() => void runStep("hash")} className="w-full justify-between"><span>Compute Hashes</span><span className="font-mono text-[11px] text-neutral-500">xxhash</span></Button>
            <Button variant="outline" size="md" loading={busy === "dates"} disabled={busy !== null} onClick={() => void runStep("dates")} className="w-full justify-between"><span>Resolve Dates</span><span className="font-mono text-[11px] text-neutral-500">EXIF / name / mtime</span></Button>
          </CardBody>
        </Card>
      </div>

      {error ? <ErrorState message={error} /> : null}
    </div>
  );
}
