import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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
  const reviewValue = !props.archiveRoot
    ? "-"
    : !props.isAnalyzed
      ? "Analysis pending"
      : props.proposalCount > 0
        ? `${formatNumber(props.proposalCount)} actions staged`
        : `${formatNumber(props.counts.total)} findings loaded`;

  return (
    <div className="grid h-screen grid-rows-[48px_1fr_auto] bg-[var(--bg)] text-[var(--text)]">
      <div className="flex items-center justify-between bg-[var(--surface-1)] px-4" style={{ WebkitAppRegion: "drag", userSelect: "none" } as CSSProperties}>
        <div className="flex min-w-0 items-center gap-[10px]">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-3)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="1" y="1" width="2" height="10" fill="var(--text)" />
              <rect x="9" y="1" width="2" height="10" fill="var(--text)" />
              <rect x="4" y="3" width="4" height="1.5" fill="var(--accent)" />
              <rect x="4" y="7.5" width="4" height="1.5" fill="var(--accent)" />
            </svg>
          </div>
          <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text)]">Curator</h1>
        </div>
        <div className="flex gap-[2px]" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <WindowBtn label="Minimize" onClick={() => void window.curator.minimizeWindow()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </WindowBtn>
          <WindowBtn label="Maximize" onClick={() => void window.curator.toggleMaximizeWindow()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </WindowBtn>
          <WindowBtn label="Close" onClick={() => void window.curator.closeWindow()} danger>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </WindowBtn>
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 border-y border-[var(--border)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 min-w-0 flex-col border-b border-[var(--border)] bg-[var(--bg)] xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-[14px]">
            <PickerRow label="Input" value={props.archiveRoot ?? "-"} buttonLabel="Browse" onClick={() => void props.onSelectArchive()} disabled={props.footerBusy} />
            <PickerRow
              label="Output"
              value={reviewValue}
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

          <div className="grid shrink-0 grid-cols-[28px_minmax(0,1fr)_92px_72px_120px_24px] border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
            <input type="checkbox" checked readOnly aria-label="Findings selected" />
            <span>Filename</span>
            <span>Class</span>
            <span className="pr-4 text-right">Size</span>
            <span className="pl-2">Status</span>
            <span />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!props.archiveRoot ? (
              <div className="p-8 text-center text-[12px] text-[var(--text-dim)]">
                Pick an archive folder.
              </div>
            ) : !props.isAnalyzed ? (
              <div className="p-8 text-center text-[12px] text-[var(--text-dim)]">Press Analyze Archive in the bottom bar.</div>
            ) : props.filteredRows.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-[var(--text-dim)]">
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
            <span>{formatNumber(props.filteredRows.length)}/{formatNumber(props.counts.total)} selected</span>
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
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Meter label="Dupes" value={props.counts.total === 0 ? 0 : Math.round((props.counts.duplicate / props.counts.total) * 100)} detail={formatNumber(props.counts.duplicate)} tone="accent" />
                <Meter label="Misplaced" value={props.counts.total === 0 ? 0 : Math.round((props.counts.misplaced / props.counts.total) * 100)} detail={formatNumber(props.counts.misplaced)} tone="muted" />
                <Meter label="Risk" value={props.counts.total === 0 ? 0 : Math.round((props.counts["zero-byte"] / props.counts.total) * 100)} detail={props.counts["zero-byte"] === 0 ? "Low" : "Review"} tone="warn" />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-[var(--border)] p-[14px]">
              <button type="button" className="flex h-[78px] w-full items-center justify-between rounded-[6px] border border-[var(--border)] bg-[rgba(34,34,34,0.92)] px-6 text-left">
                <span className="text-[18px] font-semibold text-[var(--text)]">{props.primaryAction.stage === "apply" ? "Plan ready" : props.primaryAction.stage === "build" ? "Review" : props.primaryAction.stage === "analyze" ? "Analyze" : "Custom"}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 9l6 6 6-6" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <RightSection title="Analyze">
              <Field label="Scope" helper="Choose which findings stay in focus.">
                <SegmentedButtons options={["All", "Duplicates", "Misplaced", "Zero-byte"]} active={filterLabels[props.filter]} onSelect={(label) => props.setFilter(label === "All" ? "all" : label === "Duplicates" ? "duplicate" : label === "Misplaced" ? "misplaced" : "zero-byte")} />
              </Field>
              <Field label="Search" helper="Filter by path or detail.">
                <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Path or detail" className="h-[50px] w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-4 text-[12px] text-[var(--text)] outline-none" />
              </Field>
            </RightSection>
            <RightSection title="Plan">
              <Field label="Action mix" helper="Curator builds reversible actions from the current findings.">
                <SegmentedButtons options={[`Quarantine ${formatNumber(props.proposalCounts.quarantine)}`, `Move ${formatNumber(props.proposalCounts.move_to_year)}`]} active={props.proposalCount > 0 ? `Quarantine ${formatNumber(props.proposalCounts.quarantine)}` : ""} onSelect={() => undefined} readonly />
              </Field>
              <Field label="Status" helper={stageText[props.primaryAction.stage]}>
                <div className="flex h-[50px] items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-4 text-[12px] text-[var(--text)]">{props.proposalCount > 0 ? "Plan ready to apply" : props.isAnalyzed ? "Build plan from findings" : "Analyze the archive first"}</div>
              </Field>
            </RightSection>
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
    <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto_auto] items-center gap-2">
      <span className="w-12 text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{props.label}</span>
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
  const sizeLabel = props.row.kind === "duplicate" ? props.row.detail : props.row.kind === "misplaced" ? "Route" : "0 B";
  const statusLabel = props.row.kind === "duplicate" ? "Ready" : props.row.kind === "misplaced" ? "Review" : "Flagged";

  return (
    <div className="border-b border-[var(--border)]" style={{ background: props.expanded ? "var(--surface-1)" : "transparent" }}>
      <div onClick={props.onToggle} className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_92px_72px_120px_24px] items-center px-4 py-2.5 text-[12px]">
        <input type="checkbox" checked readOnly aria-label={`${props.row.title} selected`} />
        <span className="truncate pr-3 text-[var(--text)]">{props.row.title}</span>
        <span className="w-fit rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{filterLabels[props.row.kind]}</span>
        <span className="pr-4 text-right text-[var(--text-muted)]">{sizeLabel}</span>
        <span className="inline-flex items-center gap-2 pl-2 text-[11px]"><span className="inline-block h-2 w-2 rounded-full" style={{ background: tone, opacity: 0.7 }} /> <span style={{ color: props.row.kind === "zero-byte" ? "var(--warn)" : "var(--text-muted)" }}>{statusLabel}</span></span>
        <div className="flex justify-end text-[var(--text-dim)]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d={props.expanded ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {props.expanded ? <div className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 px-4 pb-[14px] text-[11px] text-[var(--text-muted)]"><span className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">Detail</span><span>{props.row.detail}</span><span className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">Action</span><span>{props.row.kind === "duplicate" ? "Quarantine extras" : props.row.kind === "misplaced" ? "Move by year" : "Review first"}</span><span className="pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">Path</span><span className="break-all text-[var(--text)]">{props.row.path}</span></div> : null}
    </div>
  );
}

function RightSection(props: { title: string; children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{props.title}</div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 9l6 6 6-6" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>{props.children}</div>;
}

function InfoRow(props: { label: string; value: string; muted?: boolean }): JSX.Element {
  return <div className="grid grid-cols-[84px_1fr] gap-2"><span className="pt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{props.label}</span><span className="text-[12px]" style={{ color: props.muted ? "var(--text-muted)" : "var(--text)" }}>{props.value}</span></div>;
}

function WindowBtn(props: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }): JSX.Element {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex h-7 w-8 items-center justify-center rounded-[4px]"
      style={{
        background: hover ? (props.danger ? "var(--error)" : "var(--surface-3)") : "transparent",
        color: hover && props.danger ? "#fff" : "var(--text-muted)",
        transition: "all var(--t)",
      }}
    >
      {props.children}
    </button>
  );
}

function Field(props: { label: string; helper: string; children: ReactNode }): JSX.Element {
  return <div className="space-y-2"><div className="text-[11px] text-[var(--text)]">{props.label}</div><div className="text-[11px] leading-7 text-[var(--text-dim)]">{props.helper}</div>{props.children}</div>;
}

function SegmentedButtons(props: { options: string[]; active: string; onSelect: (value: string) => void; readonly?: boolean }): JSX.Element {
  return <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] p-1">{props.options.map((option) => <button key={option} type="button" onClick={() => props.onSelect(option)} disabled={props.readonly} className="h-[42px] rounded-[6px] px-3 text-[12px] transition-colors disabled:cursor-default" style={{ background: props.active === option ? "var(--surface-3)" : "transparent", color: props.active === option ? "var(--text)" : "var(--text-muted)" }}>{option}</button>)}</div>;
}

function Meter(props: { label: string; value: number; detail: string; tone: "accent" | "muted" | "warn" }): JSX.Element {
  const color = props.tone === "accent" ? "var(--accent)" : props.tone === "warn" ? "var(--warn)" : "var(--text-muted)";
  return <div className="flex min-w-0 flex-col gap-1"><div className="flex items-baseline justify-between gap-2"><span className="text-[11px] text-[var(--text)]">{props.label}</span><span className="truncate text-[10px]" style={{ color }}>{props.detail}</span></div><div className="h-1 rounded-[999px] bg-[var(--border)]"><div className="h-1 rounded-[999px]" style={{ width: `${Math.max(0, Math.min(100, props.value))}%`, background: color }} /></div></div>;
}
