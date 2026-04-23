import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AppVersion, ScanResult, Session, SidecarVersion } from "@shared/types";
import type { PrimaryActionState, ReviewRow } from "../../lib/dashboard";
import { sessionStatus } from "../../lib/curatorUi";
import { formatBytes, formatDateTime, formatDuration, formatNumber, shortHash } from "../../lib/format";

export type DashboardSurfaceFilter = "all" | "duplicate" | "misplaced" | "zero-byte";

const filterLabels: Record<DashboardSurfaceFilter, string> = {
  all: "All",
  duplicate: "Duplicates",
  misplaced: "Misplaced",
  "zero-byte": "Zero-byte",
};

const stageText = {
  select: "Choose an archive folder to arm the workspace.",
  analyze: "Analyze archive to inspect duplicates, misplaced files, and zero-byte files.",
  build: "Build a reversible plan from the findings currently in view.",
  apply: "Apply the plan on disk. Every action is recorded and can be undone.",
};

const kindColor: Record<Exclude<DashboardSurfaceFilter, "all">, string> = {
  duplicate: "var(--accent)",
  misplaced: "#7dd3fc",
  "zero-byte": "var(--warn)",
};

export interface DashboardSurfaceProps {
  app: AppVersion | null;
  archiveRoot: string | null;
  clearArchive: () => void;
  counts: { duplicate: number; misplaced: number; "zero-byte": number; total: number };
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
  proposalCounts: { quarantine: number; move_to_year: number };
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
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedRowKey) return;
    if (!props.filteredRows.some((row) => row.key === expandedRowKey)) setExpandedRowKey(null);
  }, [expandedRowKey, props.filteredRows]);

  const queueHeadline = !props.archiveRoot
    ? "Select an archive folder to begin."
    : !props.isAnalyzed
      ? "Archive selected. Analysis has not started yet."
      : props.counts.total === 0
        ? "No cleanup findings in the latest analysis."
        : `${formatNumber(props.counts.total)} finding${props.counts.total === 1 ? "" : "s"} ready for review.`;

  const queueDetail = props.progressLabel ?? stageText[props.primaryAction.stage];
  const latestSession = props.recentSessions[0] ?? null;

  return (
    <div className="grid h-screen grid-rows-[48px_1fr_auto] bg-[var(--bg)] text-[var(--text)]">
      <div className="flex items-center justify-between bg-[var(--surface-1)] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-3)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="1" y="1" width="2" height="10" fill="var(--text)" />
              <rect x="9" y="1" width="2" height="10" fill="var(--text)" />
              <rect x="4" y="3" width="4" height="1.5" fill="var(--accent)" />
              <rect x="4" y="7.5" width="4" height="1.5" fill="var(--accent)" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text)]">Curator</h1>
            <div className="truncate text-[10px] text-[var(--text-dim)]">Archive review workspace</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-[var(--text-muted)]">
          <span className="h-2 w-2 rounded-full" style={{ background: props.ping ? "var(--accent)" : props.ping === false ? "var(--error)" : "var(--text-dim)" }} />
          <span>{props.ping ? "Sidecar online" : props.ping === false ? "Sidecar offline" : "Connecting"}</span>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 border-y border-[var(--border)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 min-w-0 flex-col border-b border-[var(--border)] bg-[var(--bg)] xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-[14px]">
            <PickerRow label="Archive" value={props.archiveRoot ?? "-"} buttonLabel="Browse" onClick={() => void props.onSelectArchive()} disabled={props.footerBusy} />
            <PickerRow
              label="Review"
              value={queueHeadline}
              buttonLabel="Clear"
              onClick={props.clearArchive}
              disabled={!props.archiveRoot || props.footerBusy}
              trailing={
                <button
                  type="button"
                  onClick={() => void props.loadFindings()}
                  disabled={!props.archiveRoot || !props.isAnalyzed || props.footerBusy || props.refreshing}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-[4px] border border-[var(--border)] text-[var(--text-muted)] disabled:cursor-not-allowed disabled:text-[var(--text-dim)] disabled:opacity-45"
                  title="Refresh findings"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 10a8 8 0 1 0 2 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              }
            />
          </div>

          {props.error ? <div className="mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{props.error}</div> : null}

          <div className="grid shrink-0 grid-cols-[28px_minmax(0,1fr)_110px_86px_132px_24px] border-b border-[var(--border)] px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
            <span />
            <span>Filename</span>
            <span>Class</span>
            <span className="text-right">Count</span>
            <span>Action</span>
            <span />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!props.archiveRoot ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <div className="text-2xl font-semibold text-[var(--text)]">Archive review workspace</div>
                  <div className="mt-2 text-[12px] text-[var(--text-dim)]">Analyze archive to inspect duplicates, misplaced files, and zero-byte files.</div>
                </div>
              </div>
            ) : !props.isAnalyzed ? (
              <div className="flex h-full items-center justify-center p-8 text-center text-[12px] text-[var(--text-dim)]">Press Analyze Archive in the bottom bar when you are ready to inspect the folder.</div>
            ) : props.filteredRows.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center text-[12px] text-[var(--text-dim)]">
                {props.reviewRowCount === 0 ? "No duplicates, misplaced files, or zero-byte files were found in the latest analysis." : "Adjust the filter rail or clear the current search to bring rows back into view."}
              </div>
            ) : (
              props.filteredRows.map((row) => (
                <QueueRow key={row.key} row={row} expanded={expandedRowKey === row.key} onToggle={() => setExpandedRowKey((current) => (current === row.key ? null : row.key))} />
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-1.5 text-[10px] text-[var(--text-dim)]">
            <span>{formatNumber(props.counts.total)} total</span>
            <span>{formatNumber(props.filteredRows.length)} visible</span>
            <span>{formatNumber(props.proposalCount)} planned</span>
            {props.counts.duplicate > 0 ? <span style={{ color: kindColor.duplicate }}>{formatNumber(props.counts.duplicate)} duplicates</span> : null}
            {props.counts.misplaced > 0 ? <span style={{ color: kindColor.misplaced }}>{formatNumber(props.counts.misplaced)} misplaced</span> : null}
            {props.counts["zero-byte"] > 0 ? <span style={{ color: kindColor["zero-byte"] }}>{formatNumber(props.counts["zero-byte"])} zero-byte</span> : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-col bg-[var(--surface-1)]">
          <div className="border-b border-[var(--border)] p-[14px]">
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="grid grid-cols-3 gap-3">
                <div><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Findings</div><div className="mt-1 text-2xl tracking-[-0.04em]">{formatNumber(props.counts.total)}</div><div className="text-[10px] text-[var(--text-muted)]">{props.result ? `${formatNumber(props.result.scanned)} scanned` : "Awaiting analysis"}</div></div>
                <div><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Plan</div><div className="mt-1 text-2xl tracking-[-0.04em]">{formatNumber(props.proposalCount)}</div><div className="text-[10px] text-[var(--text-muted)]">{props.proposalCount > 0 ? "Actions queued" : "Nothing staged"}</div></div>
                <div><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">Sessions</div><div className="mt-1 text-2xl tracking-[-0.04em]">{formatNumber(props.sessionsTotal)}</div><div className="truncate text-[10px] text-[var(--text-muted)]">{latestSession ? shortHash(latestSession.id, 8, 4) : "No history yet"}</div></div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <RightSection title="Workflow"><InfoRow label="Mode" value={props.primaryAction.label} /><InfoRow label="Stage" value={stageText[props.primaryAction.stage]} muted /><InfoRow label="Scanned" value={props.result ? `${formatNumber(props.result.scanned)} files` : "Not analyzed"} /><InfoRow label="Waste" value={props.counts.duplicate > 0 ? formatBytes(props.duplicateWaste) : "0 B"} /></RightSection>
            <RightSection title="Filters"><div className="space-y-2"><input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Path or detail" className="h-[30px] w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 text-[12px] text-[var(--text)] outline-none" /><div className="flex flex-wrap gap-1.5">{(["all", "duplicate", "misplaced", "zero-byte"] as DashboardSurfaceFilter[]).map((key) => <button key={key} type="button" onClick={() => props.setFilter(key)} className="rounded-[4px] border px-2 py-1 text-[11px]" style={{ borderColor: props.filter === key ? "var(--border-strong)" : "var(--border)", background: props.filter === key ? "var(--surface-3)" : "var(--surface-1)", color: props.filter === key ? "var(--text)" : "var(--text-muted)" }}>{filterLabels[key]} {formatNumber(key === "all" ? props.counts.total : props.counts[key])}</button>)}</div></div></RightSection>
            <RightSection title="Plan"><InfoRow label="Quarantine" value={formatNumber(props.proposalCounts.quarantine)} /><InfoRow label="Move to year" value={formatNumber(props.proposalCounts.move_to_year)} /><InfoRow label="Ready" value={props.proposalCount > 0 ? "Plan staged" : "Build required"} muted /></RightSection>
            <RightSection title="Recent sessions">{props.sessionsLoading ? <div className="text-[12px] text-[var(--text-dim)]">Loading sessions...</div> : props.recentSessions.length === 0 ? <div className="text-[12px] text-[var(--text-dim)]">No sessions yet.</div> : <div className="space-y-2">{props.recentSessions.map((row) => { const status = sessionStatus(row); return <div key={row.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-[var(--text)]">{shortHash(row.id, 8, 4)}</span><span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: status === "active" ? "#7dd3fc" : "var(--accent)" }}>{status}</span></div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{formatDateTime(row.started_at)}</div><div className="text-[11px] text-[var(--text-dim)]">{formatNumber(row.action_count)} actions | {formatDuration(row.started_at, row.completed_at)}</div><div className="mt-2 flex justify-end"><button type="button" onClick={() => props.onUndoTarget(row)} disabled={status === "active" || props.undoingId !== null} className="h-7 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 text-[11px] text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-dim)] disabled:opacity-45">{props.undoingId === row.id ? "Undoing..." : "Undo"}</button></div></div>; })}</div>}</RightSection>
            <RightSection title="System"><InfoRow label="Sidecar" value={props.sidecar ? props.sidecar.sidecar : "Waiting"} /><InfoRow label="Python" value={props.sidecar ? props.sidecar.python : "-"} /><InfoRow label="Electron" value={props.app ? props.app.electron : "-"} /><InfoRow label="Node" value={props.app ? props.app.node : "-"} /></RightSection>
          </div>
        </div>
      </div>

      <div className="relative bg-[var(--surface-1)]">
        {props.footerBusy ? <div className="absolute inset-x-0 top-0 h-[2px] bg-[var(--border)]"><div className="h-full w-[42%] animate-pulse" style={{ background: props.primaryAction.stage === "apply" ? "var(--error)" : "var(--accent)" }} /></div> : null}
        <div className="grid grid-cols-[168px_minmax(0,1fr)]">
          <button type="button" onClick={() => void props.onPrimaryAction()} disabled={props.footerBusy} className="min-h-14 border-r border-[var(--border)] text-[13px] font-semibold disabled:cursor-not-allowed" style={{ color: props.footerBusy ? "var(--text-dim)" : props.primaryAction.stage === "apply" ? "#fff" : "#0a0a0a", background: props.footerBusy ? "var(--surface-2)" : props.primaryAction.stage === "apply" ? "var(--error)" : "var(--accent)" }}>{props.footerBusy ? "Working..." : props.primaryAction.label}</button>
          <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-2"><div className="text-[12px] text-[var(--text)]">{props.error ?? queueHeadline}</div><div className="flex items-center gap-3"><div className="truncate text-[10px] text-[var(--text-dim)]">{queueDetail}</div>{latestSession ? <button type="button" onClick={() => props.onUndoTarget(latestSession)} disabled={props.footerBusy || props.undoingId !== null} className="shrink-0 text-[11px] text-[var(--text-muted)] underline underline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-45">Undo last session</button> : props.isAnalyzed ? <button type="button" onClick={() => void props.loadFindings()} disabled={props.footerBusy || props.refreshing} className="shrink-0 text-[11px] text-[var(--text-muted)] underline underline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-45">Refresh findings</button> : null}</div></div>
        </div>
      </div>
    </div>
  );
}

function PickerRow(props: {
  label: string;
  value: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: JSX.Element;
}): JSX.Element {
  return (
    <div className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)_auto_auto] items-center gap-2">
      <span className="w-[54px] text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{props.label}</span>
      <div title={props.value} className="flex h-[30px] min-w-0 items-center gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface-1)] px-2.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate text-[12px]" style={{ color: props.value === "-" ? "var(--text-dim)" : "var(--text)" }}>{props.value}</span>
      </div>
      <button type="button" onClick={props.onClick} disabled={props.disabled} className="h-[30px] rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-dim)] disabled:opacity-45">{props.buttonLabel}</button>
      {props.trailing ?? <div className="w-[30px]" />}
    </div>
  );
}

function QueueRow(props: { row: ReviewRow; expanded: boolean; onToggle: () => void }): JSX.Element {
  const tone = kindColor[props.row.kind];
  const countLabel = props.row.kind === "duplicate" ? props.row.title.split(" ")[0] ?? "1" : "1";

  return (
    <div className="border-b border-[var(--border)]" style={{ background: props.expanded ? "var(--surface-1)" : "transparent" }}>
      <div onClick={props.onToggle} className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_110px_86px_132px_24px] items-center px-4 py-2.5 text-[12px]">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
        <span className="truncate pr-3 text-[var(--text)]">{props.row.title}</span>
        <span className="w-fit rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{filterLabels[props.row.kind]}</span>
        <span className="pr-4 text-right text-[var(--text-muted)]">{countLabel}</span>
        <span className="text-[11px]" style={{ color: tone }}>{props.row.kind === "duplicate" ? "Quarantine extras" : props.row.kind === "misplaced" ? "Move by year" : "Review first"}</span>
        <div className="flex justify-end text-[var(--text-dim)]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d={props.expanded ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {props.expanded ? <div className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-[var(--text-muted)]"><span className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">Detail</span><span>{props.row.detail}</span><span className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">Path</span><span className="break-all text-[var(--text)]">{props.row.path}</span></div> : null}
    </div>
  );
}

function RightSection(props: { title: string; children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-2.5 border-b border-[var(--border)] px-4 py-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{props.title}</div>{props.children}</div>;
}

function InfoRow(props: { label: string; value: string; muted?: boolean }): JSX.Element {
  return <div className="grid grid-cols-[84px_1fr] gap-2"><span className="pt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{props.label}</span><span className="text-[12px]" style={{ color: props.muted ? "var(--text-muted)" : "var(--text)" }}>{props.value}</span></div>;
}
