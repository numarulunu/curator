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
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { MonoPath } from "../components/ui/MonoPath";
import { useCuratorEvents } from "../hooks/useCuratorEvents";
import { buildReviewRows, resolvePrimaryAction } from "../lib/dashboard";
import { countProposalActions, sessionStatus, stripIpcPrefix } from "../lib/curatorUi";
import { formatBytes, formatDateTime, formatDuration, formatNumber, shortHash } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

type ReviewFilter = "all" | "duplicate" | "misplaced" | "zero-byte";

const filterLabels: Record<ReviewFilter, string> = {
  all: "All",
  duplicate: "Duplicates",
  misplaced: "Misplaced",
  "zero-byte": "Zero-byte",
};

const kindTone: Record<Exclude<ReviewFilter, "all">, BadgeTone> = {
  duplicate: "warn",
  misplaced: "info",
  "zero-byte": "danger",
};

const stageText = {
  select: "Choose the archive folder to arm the workspace.",
  analyze: "Scan the archive, hash files, and resolve dates before reviewing actions.",
  build: "Build a reversible cleanup plan from the current findings.",
  apply: "Apply the plan on disk. Every action is recorded and can be undone.",
};

export function Dashboard(): JSX.Element {
  const { archiveRoot, pickArchive, setArchiveRoot } = useArchive();
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
  const [filter, setFilter] = useState<ReviewFilter>("all");
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
        window.curator.duplicatesExact(),
        window.curator.listMisplaced(),
        window.curator.listZeroByte(),
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
      await window.curator.hashAll();
      await window.curator.resolveDates();
      await loadFindings();
      setIsAnalyzed(true);
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
      const next = await window.curator.applyProposals(archiveRoot, proposals);
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
  const footerButtonClass = primaryAction.stage === "apply"
    ? "bg-rose-700 text-white hover:bg-rose-600 border-rose-700 hover:border-rose-600"
    : "bg-emerald-400 text-neutral-950 hover:bg-emerald-300 border-emerald-400 hover:border-emerald-300";

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
    <div className="flex h-full flex-col overflow-hidden bg-neutral-950">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1680px] px-6 py-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_500px]">
            <div className="space-y-5">
              <Card className="overflow-hidden border-neutral-800 bg-[linear-gradient(180deg,rgba(20,20,20,0.96),rgba(10,10,10,0.98))]">
                <CardBody className="space-y-5 p-0">
                  <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-neutral-100">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 7h7l2 2h7v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
                          <path d="M9 13h6" />
                        </svg>
                      </div>
                      <div>
                        <h1 className="text-[34px] leading-none text-neutral-100">Curator</h1>
                        <p className="mt-2 max-w-2xl text-[15px] text-neutral-400">
                          One archive workspace. Analyze first, review the findings, then build and apply a reversible cleanup plan.
                        </p>
                      </div>
                    </div>
                    <Badge tone={ping ? "success" : ping === false ? "danger" : "muted"} uppercase>
                      {ping ? "Sidecar Online" : ping === false ? "Sidecar Offline" : "Connecting"}
                    </Badge>
                  </div>

                  <div className="space-y-3 px-5 pb-5">
                    <div className="grid gap-3 md:grid-cols-[110px_minmax(0,1fr)_auto_auto]">
                      <div className="eyebrow flex items-center">Archive</div>
                      <div className="flex min-h-[52px] items-center rounded-md border border-neutral-800 bg-neutral-950 px-4 text-[15px] text-neutral-200">
                        {archiveRoot ? <MonoPath path={archiveRoot} /> : <span className="text-neutral-500">Choose the folder you want Curator to inspect.</span>}
                      </div>
                      <Button variant="outline" size="lg" onClick={() => void pickArchive()} className="min-w-[120px]">
                        Browse
                      </Button>
                      <Button variant="ghost" size="lg" onClick={() => setArchiveRoot(null)} disabled={!archiveRoot}>
                        Clear
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                        <div className="eyebrow">Review queue</div>
                        <div className="mt-2 text-[28px] font-semibold text-neutral-100">{formatNumber(counts.total)}</div>
                        <div className="mt-1 text-[12.5px] text-neutral-500">findings waiting for review</div>
                      </div>
                      <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                        <div className="eyebrow">Duplicate waste</div>
                        <div className="mt-2 text-[28px] font-semibold text-neutral-100">{formatBytes(duplicateWaste)}</div>
                        <div className="mt-1 text-[12.5px] text-neutral-500">reclaimable if extra copies are quarantined</div>
                      </div>
                      <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                        <div className="eyebrow">Plan actions</div>
                        <div className="mt-2 text-[28px] font-semibold text-neutral-100">{formatNumber(proposals?.length ?? 0)}</div>
                        <div className="mt-1 text-[12.5px] text-neutral-500">prepared but not yet applied</div>
                      </div>
                      <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                        <div className="eyebrow">Last scan</div>
                        <div className="mt-2 text-[28px] font-semibold text-neutral-100">{result ? formatNumber(result.scanned) : "-"}</div>
                        <div className="mt-1 text-[12.5px] text-neutral-500">{result ? "files indexed" : "not analyzed yet"}</div>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="min-h-[560px] overflow-hidden border-neutral-800 bg-neutral-950/70">
                <CardHeader className="items-start gap-4">
                  <div>
                    <CardTitle className="text-neutral-200">Review Queue</CardTitle>
                    <div className="mt-2 text-[13px] text-neutral-500">A single list of duplicates, misplaced files, and zero-byte files.</div>
                  </div>
                  <div className="flex flex-1 flex-col items-stretch gap-3 md:items-end">
                    <div className="flex flex-wrap gap-2">
                      {(["all", "duplicate", "misplaced", "zero-byte"] as ReviewFilter[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilter(key)}
                          className={
                            "rounded-md border px-3 py-1.5 text-[12px] transition-colors " +
                            (filter === key
                              ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                              : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:border-neutral-700 hover:text-neutral-200")
                          }
                        >
                          {filterLabels[key]} {key === "all" ? formatNumber(counts.total) : formatNumber(counts[key])}
                        </button>
                      ))}
                    </div>
                    <Input placeholder="Filter by path or detail..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full md:w-[320px]" />
                  </div>
                </CardHeader>

                <CardBody className="p-0">
                  {error ? <ErrorState message={error} /> : null}

                  {!archiveRoot ? (
                    <div className="p-8 text-center">
                      <div className="text-[18px] font-semibold text-neutral-100">No archive selected</div>
                      <div className="mt-2 text-[13px] text-neutral-500">Choose a folder above. Curator will wait until you press Analyze Archive.</div>
                    </div>
                  ) : !isAnalyzed ? (
                    <div className="p-8 text-center">
                      <div className="text-[18px] font-semibold text-neutral-100">Archive loaded</div>
                      <div className="mt-2 text-[13px] text-neutral-500">Curator has not scanned this archive yet. Press Analyze Archive to build the review queue.</div>
                    </div>
                  ) : filteredRows.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="text-[18px] font-semibold text-neutral-100">{reviewRows.length === 0 ? "Archive looks clean" : "No matches"}</div>
                      <div className="mt-2 text-[13px] text-neutral-500">
                        {reviewRows.length === 0 ? "No duplicates, misplaced files, or zero-byte files were found in the latest analysis." : "Clear or refine the current filter to see more findings."}
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[740px] overflow-auto">
                      <div className="grid grid-cols-[minmax(0,1.3fr)_180px_140px] gap-4 border-b border-neutral-800 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-neutral-600">
                        <div>Item</div>
                        <div>Class</div>
                        <div>Status</div>
                      </div>
                      <ul>
                        {filteredRows.map((row) => (
                          <li key={row.key} className="grid grid-cols-[minmax(0,1.3fr)_180px_140px] gap-4 border-b border-neutral-900 px-5 py-4 last:border-b-0">
                            <div className="min-w-0">
                              <div className="text-[18px] font-medium text-neutral-100">{row.title}</div>
                              <div className="mt-1 text-[13px] text-neutral-500">{row.detail}</div>
                              <div className="mt-3"><MonoPath path={row.path} /></div>
                            </div>
                            <div className="flex items-start pt-1">
                              <Badge tone={kindTone[row.kind]} uppercase>{filterLabels[row.kind]}</Badge>
                            </div>
                            <div className="flex items-start pt-1 text-[13px] text-neutral-400">
                              {row.kind === "duplicate" ? "Plan can quarantine extras" : row.kind === "misplaced" ? "Plan can move by year" : "Review before planning"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="border-neutral-800 bg-neutral-900/70">
                <CardHeader>
                  <CardTitle className="text-neutral-200">Workflow</CardTitle>
                  {progressLabel ? <Badge tone="info" uppercase>{progressLabel}</Badge> : null}
                </CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <div className="eyebrow">Current step</div>
                    <div className="mt-2 text-[28px] font-semibold text-neutral-100">{primaryAction.label}</div>
                    <div className="mt-2 text-[13px] leading-relaxed text-neutral-500">{stageText[primaryAction.stage]}</div>
                  </div>

                  <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="eyebrow">Versions</span>
                      <Badge tone="muted" uppercase>{sidecar ? sidecar.sidecar : "waiting"}</Badge>
                    </div>
                    <div className="text-[13px] text-neutral-400">App: {app ? `Electron ${app.electron} / Node ${app.node}` : "-"}</div>
                    <div className="text-[13px] text-neutral-400">Python: {sidecar ? sidecar.python : "-"}</div>
                    <div className="text-[13px] text-neutral-400">Archive: {archiveRoot ? "selected" : "not selected"}</div>
                  </div>

                  <div className="space-y-2">
                    <Button variant="outline" size="md" onClick={() => void analyzeArchive()} loading={analyzing} disabled={!archiveRoot || footerBusy} className="w-full justify-between">
                      <span>Analyze Archive</span>
                      <span className="font-mono text-[11px] text-neutral-500">scan + hash + dates</span>
                    </Button>
                    <Button variant="outline" size="md" onClick={() => void buildPlan()} loading={building} disabled={!archiveRoot || !isAnalyzed || footerBusy} className="w-full justify-between">
                      <span>Build Plan</span>
                      <span className="font-mono text-[11px] text-neutral-500">reversible actions</span>
                    </Button>
                    <Button variant="ghost" size="md" onClick={() => void loadFindings()} loading={refreshing} disabled={!archiveRoot || !isAnalyzed || footerBusy} className="w-full justify-between">
                      <span>Refresh Findings</span>
                      <span className="font-mono text-[11px] text-neutral-600">same archive</span>
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Card className="border-neutral-800 bg-neutral-900/70">
                <CardHeader>
                  <CardTitle className="text-neutral-200">Plan Summary</CardTitle>
                  <Badge tone={(proposals?.length ?? 0) > 0 ? "warn" : "muted"} uppercase>{formatNumber(proposals?.length ?? 0)} actions</Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                      <div className="eyebrow">Quarantine</div>
                      <div className="mt-2 text-[26px] font-semibold text-neutral-100">{formatNumber(proposalCounts.quarantine)}</div>
                    </div>
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                      <div className="eyebrow">Move to year</div>
                      <div className="mt-2 text-[26px] font-semibold text-neutral-100">{formatNumber(proposalCounts.move_to_year)}</div>
                    </div>
                  </div>

                  {proposals && proposals.length > 0 ? (
                    <div className="space-y-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-4 text-[13px] text-amber-200">
                      <div className="font-semibold text-amber-100">Plan ready</div>
                      <div>The latest plan is prepared but not yet applied. Review the queue, then use the footer action to commit the filesystem changes.</div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-[13px] text-neutral-500">
                      No active plan yet. Analyze first, then build the reversible action list.
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card className="border-neutral-800 bg-neutral-900/70">
                <CardHeader>
                  <CardTitle className="text-neutral-200">Recent Sessions</CardTitle>
                  <Badge tone="muted" uppercase>{sessionsLoading ? "Loading" : `${sessions.length} total`}</Badge>
                </CardHeader>
                <CardBody className="space-y-3">
                  {recentSessions.length === 0 ? (
                    <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4 text-[13px] text-neutral-500">
                      No sessions yet. The first apply run will create an undoable session here.
                    </div>
                  ) : (
                    recentSessions.map((row) => {
                      const status = sessionStatus(row);
                      return (
                        <div key={row.id} className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-[12px] text-neutral-200">{shortHash(row.id, 8, 4)}</div>
                            <Badge tone={status === "active" ? "info" : "success"} uppercase>{status === "active" ? "Active" : "Complete"}</Badge>
                          </div>
                          <div className="mt-3 text-[13px] text-neutral-500">Started {formatDateTime(row.started_at)}</div>
                          <div className="mt-1 text-[13px] text-neutral-500">{formatNumber(row.action_count)} actions � {formatDuration(row.started_at, row.completed_at)}</div>
                          <div className="mt-4 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setUndoTarget(row)} disabled={status === "active" || undoingId !== null} loading={undoingId === row.id}>
                              Undo
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex w-full max-w-[1680px] items-stretch gap-0 px-0">
          {primaryAction.stage === "select" ? (
            <div className="flex min-h-[98px] flex-1 items-center justify-between px-6 text-[15px] text-neutral-400">
              <div>
                <div className="text-[24px] font-semibold text-neutral-100">Choose an archive to begin</div>
                <div className="mt-1 text-[13px] text-neutral-500">Curator will not scan anything until you explicitly ask it to analyze.</div>
              </div>
              <Button variant="outline" size="lg" onClick={() => void pickArchive()} className="min-w-[160px]">
                Select Archive
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant={primaryAction.stage === "apply" ? "danger" : "primary"}
                size="lg"
                onClick={() => void onPrimaryAction()}
                loading={footerBusy}
                className={`h-[98px] min-w-[320px] justify-center rounded-none text-[20px] font-semibold ${footerButtonClass}`}
              >
                {primaryAction.label}
              </Button>
              <div className="flex min-h-[98px] flex-1 items-center justify-between px-8">
                <div>
                  <div className="text-[22px] font-semibold text-neutral-100">{primaryAction.label}</div>
                  <div className="mt-1 text-[13px] text-neutral-500">{progressLabel ?? stageText[primaryAction.stage]}</div>
                </div>
                <div className="flex items-center gap-8 text-[13px] text-neutral-500">
                  <div>{formatNumber(counts.total)} findings</div>
                  <div>{formatNumber(proposals?.length ?? 0)} planned actions</div>
                  <div>{formatNumber(sessions.length)} sessions</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
