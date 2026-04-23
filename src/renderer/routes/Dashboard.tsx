import { useEffect, useMemo, useState } from "react";
import type {
  AppVersion,
  DuplicateCluster,
  MisplacedFile,
  Proposal,
  ScanResult,
  Session,
  SidecarVersion,
  ZeroByteFile,
} from "@shared/types";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useCuratorEvents } from "../hooks/useCuratorEvents";
import { buildReviewRows, resolvePrimaryAction } from "../lib/dashboard";
import { countProposalActions, stripIpcPrefix } from "../lib/curatorUi";
import { shortHash } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";
import { DashboardSurface, type DashboardSurfaceFilter } from "../components/dashboard/DashboardSurface";

export function Dashboard(): JSX.Element {
  const { archiveRoot, outputRoot, pickArchive, pickOutput, setArchiveRoot, setOutputRoot } = useArchive();
  const { push } = useToast();
  const event = useCuratorEvents();

  const [app, setApp] = useState<AppVersion | null>(null);
  const [sidecar, setSidecar] = useState<SidecarVersion | null>(null);
  const [ping, setPing] = useState<boolean | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);
  const [misplaced, setMisplaced] = useState<MisplacedFile[]>([]);
  const [zeroByte, setZeroByte] = useState<ZeroByteFile[]>([]);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DashboardSurfaceFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<Session | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setApp).catch(() => setApp(null));
    window.curator.getSidecarVersion().then(setSidecar).catch(() => setSidecar(null));
    window.curator.ping().then(setPing).catch(() => setPing(false));
    void loadSessions();
  }, []);

  useEffect(() => {
    setResult(null);
    setDuplicates([]);
    setMisplaced([]);
    setZeroByte([]);
    setProposals(null);
    setIsAnalyzed(false);
    setQuery("");
    setFilter("all");
    setError(null);
  }, [archiveRoot]);

  async function loadSessions(): Promise<void> {
    setSessionsLoading(true);
    try {
      const rows = await window.curator.listSessions();
      setSessions(rows);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadFindings(): Promise<void> {
    if (!archiveRoot) return;
    setRefreshing(true);
    try {
      const [nextDuplicates, nextMisplaced, nextZeroByte] = await Promise.all([
        window.curator.duplicatesExact(archiveRoot),
        window.curator.listMisplaced(archiveRoot),
        window.curator.listZeroByte(archiveRoot),
      ]);
      setDuplicates(nextDuplicates);
      setMisplaced(nextMisplaced);
      setZeroByte(nextZeroByte);
    } finally {
      setRefreshing(false);
    }
  }

  function clearReview(): void {
    setResult(null);
    setDuplicates([]);
    setMisplaced([]);
    setZeroByte([]);
    setProposals(null);
    setIsAnalyzed(false);
  }

  async function analyzeArchive(): Promise<void> {
    if (!archiveRoot) return;
    setAnalyzing(true);
    setError(null);
    setProposals(null);
    try {
      const scan = await window.curator.scan(archiveRoot);
      setResult(scan);
      if (scan.scanned === 0) {
        setDuplicates([]);
        setMisplaced([]);
        setZeroByte([]);
        setProposals(null);
        setQuery("");
        setFilter("all");
        setIsAnalyzed(true);
        push({
          kind: "error",
          title: "No supported media files found",
          message: "Curator only indexes supported photo/video formats in the selected archive.",
        });
        return;
      }
      setIsAnalyzed(true);
      await window.curator.hashAll(archiveRoot);
      await window.curator.resolveDates(archiveRoot);
      await loadFindings();
      push({ kind: "success", title: "Analysis complete", message: `${scan.scanned} files indexed.` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Analysis failed", message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function buildPlan(): Promise<void> {
    if (!archiveRoot) return;
    setBuilding(true);
    setError(null);
    try {
      const next = await window.curator.buildProposals(archiveRoot);
      setProposals(next);
      push({ kind: "success", title: "Plan built", message: `${next.length} action${next.length === 1 ? "" : "s"} prepared.` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Build failed", message });
    } finally {
      setBuilding(false);
    }
  }

  async function applyPlan(): Promise<void> {
    if (!archiveRoot || !proposals || proposals.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const next = await window.curator.applyProposals(archiveRoot, proposals, outputRoot);
      setConfirmApplyOpen(false);
      clearReview();
      await loadSessions();
      push({ kind: "success", title: "Plan applied", message: `Session ${shortHash(next.session_id, 8, 4)} recorded.` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Apply failed", message });
    } finally {
      setApplying(false);
    }
  }

  async function undoSession(row: Session): Promise<void> {
    setUndoingId(row.id);
    setError(null);
    try {
      await window.curator.undoSession(row.id);
      setUndoTarget(null);
      clearReview();
      await loadSessions();
      push({ kind: "success", title: "Session undone", message: `${row.action_count} action${row.action_count === 1 ? "" : "s"} reverted.` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Undo failed", message });
    } finally {
      setUndoingId(null);
    }
  }

  const reviewRows = useMemo(() => buildReviewRows(duplicates, misplaced, zeroByte), [duplicates, misplaced, zeroByte]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reviewRows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (!needle) return true;
      return [row.path, row.title, row.detail].some((value) => value.toLowerCase().includes(needle));
    });
  }, [filter, query, reviewRows]);

  const counts = useMemo(
    () => ({
      duplicate: duplicates.length,
      misplaced: misplaced.length,
      "zero-byte": zeroByte.length,
      total: reviewRows.length,
    }),
    [duplicates.length, misplaced.length, reviewRows.length, zeroByte.length],
  );

  const duplicateWaste = useMemo(
    () => duplicates.reduce((sum, cluster) => sum + Math.max(0, cluster.count - 1) * cluster.size, 0),
    [duplicates],
  );

  const proposalCounts = useMemo(() => countProposalActions(proposals ?? []), [proposals]);
  const primaryAction = useMemo(
    () => resolvePrimaryAction({ archiveRoot, isAnalyzed, proposalCount: proposals?.length ?? 0 }),
    [archiveRoot, isAnalyzed, proposals],
  );

  const progressLabel = useMemo(() => {
    if (!event) return null;
    if (event.kind === "scan.progress" && typeof event.scanned === "number") return `Scanning ${event.scanned} files`;
    if (event.kind === "hash.progress" && typeof event.hashed === "number" && typeof event.total === "number") return `Hashing ${event.hashed} / ${event.total}`;
    return null;
  }, [event]);

  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()).slice(0, 5),
    [sessions],
  );

  const footerBusy = analyzing || building || applying;

  async function onPrimaryAction(): Promise<void> {
    if (primaryAction.stage === "select") {
      await pickArchive();
      return;
    }
    if (primaryAction.stage === "analyze") {
      await analyzeArchive();
      return;
    }
    if (primaryAction.stage === "build") {
      await buildPlan();
      return;
    }
    setConfirmApplyOpen(true);
  }

  return (
    <>
      <DashboardSurface
        app={app}
        archiveRoot={archiveRoot}
        outputRoot={outputRoot}
        clearArchive={() => setArchiveRoot(null)}
        clearOutput={() => setOutputRoot(null)}
        counts={counts}
        duplicateWaste={duplicateWaste}
        error={error}
        filter={filter}
        filteredRows={filteredRows}
        footerBusy={footerBusy}
        isAnalyzed={isAnalyzed}
        loadFindings={loadFindings}
        onPrimaryAction={onPrimaryAction}
        onSelectArchive={async () => { await pickArchive(); }}
        onSelectOutput={async () => { await pickOutput(); }}
        onUndoTarget={setUndoTarget}
        ping={ping}
        primaryAction={primaryAction}
        progressLabel={progressLabel}
        proposalCount={proposals?.length ?? 0}
        proposalCounts={proposalCounts}
        query={query}
        recentSessions={recentSessions}
        refreshing={refreshing}
        result={result}
        reviewRowCount={reviewRows.length}
        sessionsLoading={sessionsLoading}
        sessionsTotal={sessions.length}
        setFilter={setFilter}
        setQuery={setQuery}
        sidecar={sidecar}
        undoingId={undoingId}
      />

      <ConfirmDialog
        open={confirmApplyOpen}
        onClose={() => (applying ? null : setConfirmApplyOpen(false))}
        onConfirm={() => void applyPlan()}
        title="Apply this cleanup plan?"
        tone="danger"
        destructive
        loading={applying}
        confirmLabel={applying ? "Applying..." : "Apply Plan"}
        description={
          <div className="space-y-2">
            <p>This will move files on disk under the current archive root and record an undo session.</p>
            <p>Review the queue carefully before confirming.</p>
          </div>
        }
      />

      <ConfirmDialog
        open={undoTarget !== null}
        onClose={() => (undoingId ? null : setUndoTarget(null))}
        onConfirm={() => (undoTarget ? void undoSession(undoTarget) : undefined)}
        title="Undo this session?"
        tone="danger"
        destructive
        loading={undoingId !== null}
        confirmLabel={undoingId ? "Undoing..." : "Undo Session"}
        description={
          undoTarget ? (
            <div className="space-y-2">
              <p>This will reverse all {undoTarget.action_count} filesystem action{undoTarget.action_count === 1 ? "" : "s"} recorded in this session.</p>
              <p className="font-mono text-[12px] text-neutral-400">{undoTarget.id}</p>
            </div>
          ) : undefined
        }
      />
    </>
  );
}
