import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AnalysisProgress,
  AnalysisSettings,
  AppVersion,
  DuplicateCluster,
  MisplacedFile,
  Proposal,
  ScanResult,
  Session,
  SidecarVersion,
  ZeroByteFile,
} from "@shared/types";
import { AnalysisProgressBar } from "../components/AnalysisProgressBar";
import { AnalysisSettingsPanel } from "../components/AnalysisSettingsPanel";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ModelDownloadBanner } from "../components/ModelDownloadBanner";
import { useCuratorEvents } from "../hooks/useCuratorEvents";
import { buildReviewRows, resolvePrimaryAction } from "../lib/dashboard";
import { countProposalActions, stripIpcPrefix } from "../lib/curatorUi";
import { shortHash } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";
import { DashboardSurface, type DashboardSurfaceFilter } from "../components/dashboard/DashboardSurface";

export function Dashboard(): JSX.Element {
  const { archiveRoot, outputRoot, pickArchive, pickOutput } = useArchive();
  const { push } = useToast();
  const event = useCuratorEvents();
  const navigate = useNavigate();

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
  const [running, setRunning] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings | null>(null);
  const [building, setBuilding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<Session | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setApp).catch(() => setApp(null));
    window.curator.getSidecarVersion().then(setSidecar).catch(() => setSidecar(null));
    window.curator.ping().then(setPing).catch(() => setPing(false));
    window.curator.getAnalysisSettings().then(setSettings).catch(() => setSettings(null));
    void loadSessions();
  }, []);

  useEffect(() => {
    if (!event || event.kind !== "analysis-progress") return;
    const phase = event.phase as AnalysisProgress["phase"];
    const processed = typeof event.processed === "number" ? event.processed : undefined;
    const total = typeof event.total === "number" ? event.total : undefined;
    const note = typeof event.note === "string" ? event.note : undefined;
    setAnalysisProgress({ phase, processed, total, note });
  }, [event]);

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

  function handleSettingsChange(next: AnalysisSettings): void {
    setSettings(next);
    void window.curator.saveAnalysisSettings(next);
  }

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
    setRunning(true);
    setAnalysisProgress({ phase: "scan" });
    setError(null);
    setProposals(null);
    try {
      const analysisResult = await window.curator.runAnalysis(archiveRoot);
      if (analysisResult.clusters_created > 0) {
        navigate("/clusters");
      } else {
        push({
          kind: "success",
          title: "Analysis complete",
          message: `${analysisResult.scanned} files scanned`,
        });
      }
      setResult({ scanned: analysisResult.scanned, root: archiveRoot });
      setIsAnalyzed(true);
      await loadFindings();
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Analysis failed", message });
    } finally {
      setRunning(false);
      setAnalysisProgress({ phase: "done" });
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

  async function retryInterrupted(sessionId: string): Promise<void> {
    setRetryingId(sessionId);
    setError(null);
    try {
      const retryResult = await window.curator.retrySession(sessionId);
      await loadSessions();
      await loadFindings();
      if (retryResult.skipped) {
        push({ kind: "success", title: "Already complete", message: "No pending actions to retry." });
      } else {
        const total = retryResult.ok + retryResult.failed;
        push({ kind: "success", title: "Retry complete", message: `${retryResult.ok}/${total} action${total === 1 ? "" : "s"} succeeded.` });
      }
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Retry failed", message });
    } finally {
      setRetryingId(null);
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

  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()).slice(0, 5),
    [sessions],
  );

  const footerBusy = running || building || applying;

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
      <ModelDownloadBanner />
      {settings !== null && (
        <AnalysisSettingsPanel settings={settings} onChange={handleSettingsChange} />
      )}
      <AnalysisProgressBar
        progress={running ? analysisProgress : null}
        running={running}
        onCancel={() => { void window.curator.cancelAnalysis(); }}
      />

      <DashboardSurface
        app={app}
        archiveRoot={archiveRoot}
        outputRoot={outputRoot}
        counts={counts}
        duplicateWaste={duplicateWaste}
        error={error}
        filter={filter}
        filteredRows={filteredRows}
        footerBusy={footerBusy}
        isAnalyzed={isAnalyzed}
        loadFindings={loadFindings}
        onPrimaryAction={onPrimaryAction}
        onRetrySession={retryInterrupted}
        onSelectArchive={async () => { await pickArchive(); }}
        onSelectOutput={async () => { await pickOutput(); }}
        onUndoTarget={setUndoTarget}
        ping={ping}
        primaryAction={primaryAction}
        proposalCount={proposals?.length ?? 0}
        proposalCounts={proposalCounts}
        query={query}
        recentSessions={recentSessions}
        refreshing={refreshing}
        result={result}
        reviewRowCount={reviewRows.length}
        sessionsLoading={sessionsLoading}
        setFilter={setFilter}
        setQuery={setQuery}
        sidecar={sidecar}
        undoingId={undoingId}
        retryingId={retryingId}
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
