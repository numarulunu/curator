import type { AppVersion, ScanResult, Session, SidecarVersion } from "@shared/types";
import type { PrimaryActionState, ReviewRow } from "../../lib/dashboard";
import { sessionStatus } from "../../lib/curatorUi";
import { formatBytes, formatDateTime, formatDuration, formatNumber, shortHash } from "../../lib/format";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { Input } from "../ui/Input";
import { MonoPath } from "../ui/MonoPath";

export type DashboardSurfaceFilter = "all" | "duplicate" | "misplaced" | "zero-byte";

const filterLabels: Record<DashboardSurfaceFilter, string> = {
  all: "All",
  duplicate: "Duplicates",
  misplaced: "Misplaced",
  "zero-byte": "Zero-byte",
};

const kindTone: Record<Exclude<DashboardSurfaceFilter, "all">, BadgeTone> = {
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

function barWidth(total: number, value: number): string {
  if (total === 0 || value === 0) return "0%";
  return `${Math.max(10, Math.round((value / total) * 100))}%`;
}

export interface DashboardSurfaceProps {
  app: AppVersion | null;
  archiveRoot: string | null;
  clearArchive: () => void;
  counts: {
    duplicate: number;
    misplaced: number;
    "zero-byte": number;
    total: number;
  };
  duplicateWaste: number;
  error: string | null;
  filter: DashboardSurfaceFilter;
  filteredRows: ReviewRow[];
  footerBusy: boolean;
  isAnalyzed: boolean;
  loadFindings: () => Promise<void>;
  onPrimaryAction: () => Promise<void>;
  onSelectArchive: () => Promise<void>;
  onUndoTarget: (row: Session) => void;
  ping: boolean | null;
  primaryAction: PrimaryActionState;
  progressLabel: string | null;
  proposalCount: number;
  proposalCounts: {
    quarantine: number;
    move_to_year: number;
  };
  query: string;
  recentSessions: Session[];
  refreshing: boolean;
  result: ScanResult | null;
  reviewRowCount: number;
  sessionsLoading: boolean;
  sessionsTotal: number;
  setFilter: (value: DashboardSurfaceFilter) => void;
  setQuery: (value: string) => void;
  sidecar: SidecarVersion | null;
  undoingId: string | null;
}

export function DashboardSurface(props: DashboardSurfaceProps): JSX.Element {
  const queueModeLabel = !props.archiveRoot
    ? "Archive not selected"
    : !props.isAnalyzed
      ? "Waiting for analysis"
      : props.proposalCount > 0
        ? "Plan ready"
        : "Findings loaded";

  const queueHeadline = !props.archiveRoot
    ? "Choose an archive to begin"
    : !props.isAnalyzed
      ? "Archive selected. Analysis has not started yet."
      : props.counts.total === 0
        ? "No cleanup findings in the latest analysis."
        : `${formatNumber(props.counts.total)} finding${props.counts.total === 1 ? "" : "s"} waiting for review.`;

  const queueSubline = props.progressLabel ?? stageText[props.primaryAction.stage];

  const railModeLabel = props.primaryAction.stage === "apply"
    ? "Ready to apply"
    : props.primaryAction.stage === "build"
      ? "Build reversible plan"
      : props.primaryAction.stage === "analyze"
        ? "Archive review"
        : "Awaiting archive";

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 7h7l2 2h7v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
              <path d="M9 13h6" />
            </svg>
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-neutral-50">Curator</h1>
        </div>
        <Badge tone={props.ping ? "success" : props.ping === false ? "danger" : "muted"} uppercase>
          {props.ping ? "Sidecar Online" : props.ping === false ? "Sidecar Offline" : "Connecting"}
        </Badge>
      </header>

      <div className="shrink-0 border-b border-neutral-800 px-6 py-5">
        <div className="space-y-4">
          <div className="grid items-center gap-3 xl:grid-cols-[92px_minmax(0,1fr)_124px]">
            <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">Archive</div>
            <div className="flex min-h-[58px] items-center rounded-xl border border-neutral-800 bg-neutral-950 px-5 text-[16px] text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              {props.archiveRoot ? <MonoPath path={props.archiveRoot} /> : <span className="text-neutral-500">No archive selected.</span>}
            </div>
            <Button variant="outline" size="lg" onClick={() => void props.onSelectArchive()} className="h-[58px] rounded-xl border-neutral-700 text-[16px] text-neutral-100 hover:border-neutral-500">
              Browse
            </Button>
          </div>

          <div className="grid items-center gap-3 xl:grid-cols-[92px_minmax(0,1fr)_108px_108px]">
            <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">Workflow</div>
            <div className="flex min-h-[58px] items-center rounded-xl border border-neutral-800 bg-neutral-950 px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="min-w-0">
                <div className="text-[16px] font-medium text-neutral-100">{queueHeadline}</div>
                <div className="mt-1 text-[12.5px] text-neutral-500">{queueSubline}</div>
              </div>
            </div>
            <Button variant="ghost" size="lg" onClick={() => void props.loadFindings()} loading={props.refreshing} disabled={!props.archiveRoot || !props.isAnalyzed || props.footerBusy} className="h-[58px] rounded-xl border border-neutral-800 bg-neutral-950 text-[14px] text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900 hover:text-neutral-100">
              Refresh
            </Button>
            <Button variant="ghost" size="lg" onClick={props.clearArchive} disabled={!props.archiveRoot || props.footerBusy} className="h-[58px] rounded-xl border border-neutral-800 bg-neutral-950 text-[14px] text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900 hover:text-neutral-100">
              Clear
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_372px]">
        <section className="flex min-h-0 flex-col border-b border-neutral-800 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-4 border-b border-neutral-800 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[13px] uppercase tracking-[0.24em] text-neutral-500">Queue</div>
              <div className="mt-2 text-[32px] font-semibold tracking-tight text-neutral-50">{queueModeLabel}</div>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
              <div className="flex flex-wrap gap-2">
                {(["all", "duplicate", "misplaced", "zero-byte"] as DashboardSurfaceFilter[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => props.setFilter(key)}
                    className={
                      "rounded-full border px-3 py-1.5 text-[12px] transition-colors " +
                      (props.filter === key
                        ? "border-neutral-500 bg-neutral-800 text-neutral-100"
                        : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:border-neutral-700 hover:text-neutral-200")
                    }
                  >
                    {filterLabels[key]} {formatNumber(key === "all" ? props.counts.total : props.counts[key])}
                  </button>
                ))}
              </div>
              <Input placeholder="Filter by path or detail..." value={props.query} onChange={(e) => props.setQuery(e.target.value)} className="h-11 w-full rounded-xl border-neutral-800 px-4 text-[14px] lg:w-[320px]" />
            </div>
          </div>

          {props.error ? <ErrorState message={props.error} /> : null}

          {!props.archiveRoot ? (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
              <div>
                <div className="text-[24px] font-semibold text-neutral-100">Choose an archive to begin</div>
                <div className="mt-3 text-[14px] text-neutral-500">Curator will not scan anything until you explicitly press Analyze Archive.</div>
              </div>
            </div>
          ) : !props.isAnalyzed ? (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
              <div>
                <div className="text-[24px] font-semibold text-neutral-100">Archive loaded</div>
                <div className="mt-3 text-[14px] text-neutral-500">Press Analyze Archive to scan the folder, compute exact duplicates, and resolve dates.</div>
              </div>
            </div>
          ) : props.filteredRows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
              <div>
                <div className="text-[24px] font-semibold text-neutral-100">{props.reviewRowCount === 0 ? "Archive looks clean" : "No matches"}</div>
                <div className="mt-3 text-[14px] text-neutral-500">
                  {props.reviewRowCount === 0 ? "No duplicates, misplaced files, or zero-byte files were found in the latest analysis." : "Clear or refine the current filter to see more findings."}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(0,1.5fr)_136px_minmax(0,0.8fr)_160px] gap-4 border-b border-neutral-800 px-6 py-4 text-[12px] uppercase tracking-[0.22em] text-neutral-500">
                  <div>Filename</div>
                  <div>Class</div>
                  <div>Detail</div>
                  <div>Status</div>
                </div>
                <ul>
                  {props.filteredRows.map((row) => (
                    <li key={row.key} className="grid grid-cols-[minmax(0,1.5fr)_136px_minmax(0,0.8fr)_160px] gap-4 border-b border-neutral-900 px-6 py-5 text-[14px]">
                      <div className="min-w-0">
                        <div className="truncate text-[17px] font-medium text-neutral-100">{row.title}</div>
                        <div className="mt-2 text-[12.5px] text-neutral-500"><MonoPath path={row.path} /></div>
                      </div>
                      <div className="flex items-start">
                        <Badge tone={kindTone[row.kind]} uppercase>{filterLabels[row.kind]}</Badge>
                      </div>
                      <div className="text-[13px] leading-6 text-neutral-400">{row.detail}</div>
                      <div className="text-[13px] leading-6 text-neutral-400">
                        {row.kind === "duplicate" ? "Can quarantine extras" : row.kind === "misplaced" ? "Can move by year" : "Review before plan"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-auto border-t border-neutral-800 bg-neutral-950 xl:border-t-0">
          <div className="space-y-6 p-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">Mode</div>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-600" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              <div className="mt-4 text-[28px] font-semibold tracking-tight text-neutral-50">{railModeLabel}</div>
              <div className="mt-2 text-[13px] leading-6 text-neutral-500">{stageText[props.primaryAction.stage]}</div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-[#1b1b1b] p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">Queue</div>
                <div className="text-[16px] font-semibold text-neutral-100">{props.result ? `${formatNumber(props.result.scanned)} files scanned` : "Not analyzed"}</div>
              </div>

              <div className="mt-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-3 text-[15px] text-neutral-100">
                    <span>Exact duplicates</span>
                    <span>{formatNumber(props.counts.duplicate)}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-neutral-900">
                    <div className="h-2 rounded-full bg-emerald-400" style={{ width: barWidth(props.counts.total, props.counts.duplicate) }} />
                  </div>
                  <div className="mt-2 text-[12.5px] text-neutral-500">{formatBytes(props.duplicateWaste)} reclaimable if extras move to quarantine.</div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 text-[15px] text-neutral-100">
                    <span>Misplaced by year</span>
                    <span>{formatNumber(props.counts.misplaced)}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-neutral-900">
                    <div className="h-2 rounded-full bg-sky-400" style={{ width: barWidth(props.counts.total, props.counts.misplaced) }} />
                  </div>
                  <div className="mt-2 text-[12.5px] text-neutral-500">Files can move into the folder that matches the resolved canonical year.</div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 text-[15px] text-neutral-100">
                    <span>Zero-byte files</span>
                    <span>{formatNumber(props.counts["zero-byte"])}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-neutral-900">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: barWidth(props.counts.total, props.counts["zero-byte"]) }} />
                  </div>
                  <div className="mt-2 text-[12.5px] text-neutral-500">Empty files are flagged before they are added to any cleanup plan.</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4">
                  <div className="flex items-center justify-between gap-3 text-[13px] uppercase tracking-[0.16em] text-neutral-500">
                    <span>Plan summary</span>
                    <span>{formatNumber(props.proposalCount)} actions</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-neutral-600">Quarantine</div>
                      <div className="mt-2 text-[24px] font-semibold text-neutral-100">{formatNumber(props.proposalCounts.quarantine)}</div>
                    </div>
                    <div>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-neutral-600">Move to year</div>
                      <div className="mt-2 text-[24px] font-semibold text-neutral-100">{formatNumber(props.proposalCounts.move_to_year)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-[#171717] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">Sessions</div>
                <div className="text-[13px] text-neutral-500">{props.sessionsLoading ? "Loading" : `${props.sessionsTotal} total`}</div>
              </div>

              <div className="mt-5 space-y-3">
                {props.recentSessions.length === 0 ? (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-[13px] leading-6 text-neutral-500">
                    No sessions yet. The first applied plan creates the undo history.
                  </div>
                ) : (
                  props.recentSessions.map((row) => {
                    const status = sessionStatus(row);
                    return (
                      <div key={row.id} className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-mono text-[12px] text-neutral-200">{shortHash(row.id, 8, 4)}</div>
                          <Badge tone={status === "active" ? "info" : "success"} uppercase>{status === "active" ? "Active" : "Complete"}</Badge>
                        </div>
                        <div className="mt-3 text-[13px] text-neutral-500">Started {formatDateTime(row.started_at)}</div>
                        <div className="mt-1 text-[13px] text-neutral-500">{formatNumber(row.action_count)} actions | {formatDuration(row.started_at, row.completed_at)}</div>
                        <div className="mt-4 flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => props.onUndoTarget(row)} disabled={status === "active" || props.undoingId !== null} loading={props.undoingId === row.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-neutral-100">
                            Undo
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-[#171717] p-5 text-[13px] leading-6 text-neutral-500">
              <div className="text-[14px] uppercase tracking-[0.2em] text-neutral-500">System</div>
              <div className="mt-4 space-y-1">
                <div>Sidecar: {props.sidecar ? props.sidecar.sidecar : "waiting"}</div>
                <div>Python: {props.sidecar ? props.sidecar.python : "-"}</div>
                <div>Electron: {props.app ? props.app.electron : "-"}</div>
                <div>Node: {props.app ? props.app.node : "-"}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="grid shrink-0 border-t border-neutral-800 bg-neutral-950 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Button variant={props.primaryAction.stage === "apply" ? "danger" : "primary"} size="lg" onClick={() => void props.onPrimaryAction()} loading={props.footerBusy} className={"h-[110px] rounded-none border-0 text-[24px] font-semibold tracking-tight " + (props.primaryAction.stage === "apply" ? "bg-rose-700 text-white hover:bg-rose-600" : "bg-emerald-400 text-neutral-950 hover:bg-emerald-300")}>
          {props.primaryAction.label}
        </Button>

        <div className="border-t border-neutral-800 px-6 py-5 lg:border-l lg:border-t-0">
          <div className="text-[20px] font-semibold tracking-tight text-neutral-100">{queueHeadline}</div>
          <div className="mt-2 text-[13px] text-neutral-500">{queueSubline}</div>
          <div className="mt-4 flex flex-wrap gap-6 text-[13px] text-neutral-500">
            <div>{formatNumber(props.counts.total)} findings</div>
            <div>{formatNumber(props.proposalCount)} planned actions</div>
            <div>{formatNumber(props.sessionsTotal)} sessions</div>
          </div>
        </div>

        <div className="border-t border-neutral-800 px-6 py-5 lg:border-l lg:border-t-0">
          <div className="text-[13px] uppercase tracking-[0.2em] text-neutral-500">Active archive</div>
          <div className="mt-3 text-[12.5px] text-neutral-400">{props.archiveRoot ? <MonoPath path={props.archiveRoot} /> : "No archive selected."}</div>
          <div className="mt-4 text-[13px] text-neutral-500">
            {props.recentSessions[0] ? `Last session ${shortHash(props.recentSessions[0].id, 8, 4)} | ${formatDateTime(props.recentSessions[0].started_at)}` : "No apply session recorded yet."}
          </div>
        </div>
      </footer>
    </div>
  );
}
