import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { AppVersion, ScanResult, Session, SidecarVersion } from "@shared/types";
import type { PrimaryActionState, ReviewRow } from "../../lib/dashboard";
import { sessionStatus } from "../../lib/curatorUi";
import { formatDateTime, formatDuration, formatNumber, shortHash } from "../../lib/format";
import { formatEta, formatEtaParts } from "../../lib/eta";

export type DashboardSurfaceFilter = "all" | "duplicate" | "misplaced" | "zero-byte";

const filterLabels: Record<DashboardSurfaceFilter, string> = {
  all: "All",
  duplicate: "Exact-match clusters",
  misplaced: "Misplaced",
  "zero-byte": "Zero-byte",
};

const stageText = {
  select: "Choose an archive folder to arm the workspace.",
  analyze: "Analyze archive to inspect exact-match clusters, misplaced files, and zero-byte files.",
  build: "Build a reversible plan from the findings currently in view.",
  apply: "Apply the plan on disk. Every action is recorded and can be undone.",
};

const kindMeta: Record<Exclude<DashboardSurfaceFilter, "all">, { badge: string; status: string; tone: string }> = {
  duplicate: { badge: "Duplicate", status: "Review", tone: "var(--accent)" },
  misplaced: { badge: "Year", status: "Move", tone: "#8ba7ff" },
  "zero-byte": { badge: "Empty", status: "Risk", tone: "var(--warn)" },
};

const QUEUE_GRID_COLUMNS = "28px minmax(0, 1fr) 92px 92px 120px 24px";

function getEmptyAnalysisHeadline(result: ScanResult | null): string {
  return result?.scanned === 0
    ? "No supported media files were indexed"
    : "No exact duplicate, misplaced, or zero-byte findings were found";
}

function getEmptyAnalysisDetail(result: ScanResult | null): string {
  return result?.scanned === 0
    ? "Check that the selected folder contains supported photo/video formats and that Curator can access it."
    : "Curator currently checks exact byte-identical duplicates only. Near-duplicate matches are not part of this analysis yet.";
}

export interface DashboardSurfaceProps {
  app: AppVersion | null;
  archiveRoot: string | null;
  outputRoot: string | null;
  counts: { duplicate: number; misplaced: number; "zero-byte": number; total: number };
  duplicateWaste: number;
  error: string | null;
  filter: DashboardSurfaceFilter;
  filteredRows: ReviewRow[];
  footerBusy: boolean;
  isAnalyzed: boolean;
  loadFindings: () => Promise<void>;
  onPrimaryAction: () => Promise<void>;
  onRetrySession: (sessionId: string) => Promise<void> | void;
  onSelectArchive: () => Promise<void>;
  onSelectOutput: () => Promise<void>;
  onUndoTarget: (row: Session) => void;
  ping: boolean | null;
  primaryAction: PrimaryActionState;
  proposalCount: number;
  proposalCounts: { quarantine: number; move_to_year: number };
  recentSessions: Session[];
  refreshing: boolean;
  result: ScanResult | null;
  reviewRowCount: number;
  sessionsLoading: boolean;
  setFilter: (value: DashboardSurfaceFilter) => void;
  sidecar: SidecarVersion | null;
  undoingId: string | null;
  retryingId: string | null;
  analysisSlot?: ReactNode;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  analysisEtaSeconds?: number;
  applyEtaSeconds?: number;
  archiveFileCount?: number | null;
  aiModeLabel?: string;
}

export function DashboardSurface(props: DashboardSurfaceProps): JSX.Element {
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [compactLayout, setCompactLayout] = useState<boolean>(() => (typeof window === "undefined" ? false : window.innerWidth < 1120));
  const emptyAnalysisHeadline = getEmptyAnalysisHeadline(props.result);
  const emptyAnalysisDetail = getEmptyAnalysisDetail(props.result);

  useEffect(() => {
    if (!expandedRowKey) return;
    if (!props.filteredRows.some((row) => row.key === expandedRowKey)) setExpandedRowKey(null);
  }, [expandedRowKey, props.filteredRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setCompactLayout(window.innerWidth < 1120);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const queueHeadline = !props.archiveRoot
    ? "Select an archive folder to begin."
    : !props.isAnalyzed
      ? "Archive selected. Analysis has not started yet."
      : props.counts.total === 0
        ? emptyAnalysisHeadline
        : `${formatNumber(props.counts.total)} finding${props.counts.total === 1 ? "" : "s"} ready for review.`;

  const queueDetail = props.isAnalyzed && props.counts.total === 0 ? emptyAnalysisDetail : stageText[props.primaryAction.stage];
  const latestSession = props.recentSessions[0] ?? null;
  const selectedCount = props.filteredRows.length;
  const wasteMetric = props.duplicateWaste > 0 ? compactMetric(props.duplicateWaste) : { value: "0", suffix: "B" };
  const indexedCount = props.archiveFileCount ?? props.result?.scanned ?? 0;
  const totalEtaText = (props.analysisEtaSeconds || 0) + (props.applyEtaSeconds || 0) > 0
    ? formatEta((props.analysisEtaSeconds || 0) + (props.applyEtaSeconds || 0))
    : null;

  const analysisEtaParts = formatEtaParts(props.analysisEtaSeconds || 0);
  const applyEtaParts = formatEtaParts(props.applyEtaSeconds || 0);

  const findingsValue = analysisEtaParts.value !== "—"
    ? analysisEtaParts.value
    : formatNumber(props.counts.total);
  const findingsSuffix = analysisEtaParts.value !== "—" ? analysisEtaParts.suffix : null;
  const findingsDetail = indexedCount > 0
    ? `${formatNumber(indexedCount)} indexed · ${formatNumber(props.counts.total)} finding${props.counts.total === 1 ? "" : "s"}${props.aiModeLabel ? ` · ${props.aiModeLabel}` : ""}`
    : "Awaiting analysis";

  const planValue = applyEtaParts.value !== "—"
    ? applyEtaParts.value
    : formatNumber(props.proposalCount);
  const planSuffix = applyEtaParts.value !== "—" ? applyEtaParts.suffix : null;
  const planDetail = props.proposalCount > 0
    ? `${formatNumber(props.proposalCount)} action${props.proposalCount === 1 ? "" : "s"} · ${formatNumber(props.proposalCounts.quarantine)} quarantine | ${formatNumber(props.proposalCounts.move_to_year)} move`
    : totalEtaText
      ? `Nothing staged · full run ${totalEtaText}`
      : "Nothing staged";

  const stats = [
    {
      label: "Analyze",
      value: findingsValue,
      suffix: findingsSuffix,
      detail: findingsDetail,
    },
    {
      label: "Waste",
      value: wasteMetric.value,
      suffix: wasteMetric.suffix,
      detail: props.counts.duplicate > 0 ? `${formatNumber(props.counts.duplicate)} exact-match cluster${props.counts.duplicate === 1 ? "" : "s"}` : "No duplicate waste yet",
    },
    {
      label: "Apply",
      value: planValue,
      suffix: planSuffix,
      detail: planDetail,
    },
  ];

  const meters = [
    {
      key: "duplicate",
      shortLabel: "Exact",
      level: `${formatNumber(props.counts.duplicate)} cluster${props.counts.duplicate === 1 ? "" : "s"}`,
      value: props.counts.total === 0 ? 0 : Math.round((props.counts.duplicate / props.counts.total) * 100),
      tone: "var(--accent)",
    },
    {
      key: "misplaced",
      shortLabel: "Move",
      level: `${formatNumber(props.counts.misplaced)} file${props.counts.misplaced === 1 ? "" : "s"}`,
      value: props.counts.total === 0 ? 0 : Math.round((props.counts.misplaced / props.counts.total) * 100),
      tone: "#8ba7ff",
    },
    {
      key: "risk",
      shortLabel: "Risk",
      level: props.counts["zero-byte"] === 0 ? "Low" : "Review",
      value: props.counts.total === 0 ? 0 : Math.round((props.counts["zero-byte"] / props.counts.total) * 100),
      tone: "var(--warn)",
    },
  ];

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateRows: "48px 1fr auto",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--surface-1)",
          WebkitAppRegion: "drag",
          userSelect: "none",
        } as CSSProperties}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Logo />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)" }}>Curator</span>
            {props.app?.version ? <span className="num" style={{ fontSize: 11, color: "var(--text-dim)" }}>v{props.app.version}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, WebkitAppRegion: "no-drag" } as CSSProperties}>
          <WindowBtn label="Minimize" onClick={() => void window.curator.minimizeWindow()} icon={<MinimizeIcon />} />
          <WindowBtn label="Maximize" onClick={() => void window.curator.toggleMaximizeWindow()} icon={<MaximizeIcon />} />
          <WindowBtn label="Close" onClick={() => void window.curator.closeWindow()} icon={<CloseIcon />} danger />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compactLayout ? "1fr" : "minmax(0, 1fr) 320px",
          gridTemplateRows: compactLayout ? "minmax(0, 1fr) minmax(260px, 40vh)" : "1fr",
          minHeight: 0,
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, borderRight: compactLayout ? "none" : "1px solid var(--border)", borderBottom: compactLayout ? "1px solid var(--border)" : "none", background: "var(--bg)" }}>
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <PickerRow label="Input" value={props.archiveRoot} onPick={() => void props.onSelectArchive()} disabled={props.footerBusy} />
            <PickerRow
              label="Output"
              value={props.outputRoot}
              onPick={() => void props.onSelectOutput()}
              disabled={props.footerBusy}
              trailing={
                <button
                  type="button"
                  onClick={() => void props.loadFindings()}
                  disabled={!props.archiveRoot || !props.isAnalyzed || props.footerBusy || props.refreshing}
                  title="Refresh findings"
                  style={{
                    width: 30,
                    height: 30,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    color: !props.archiveRoot || !props.isAnalyzed || props.footerBusy || props.refreshing ? "var(--text-dim)" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    opacity: !props.archiveRoot || !props.isAnalyzed || props.footerBusy || props.refreshing ? 0.45 : 1,
                    transition: "all var(--t)",
                  }}
                >
                  <RefreshIcon />
                </button>
              }
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: QUEUE_GRID_COLUMNS, padding: "10px 16px", fontSize: 10, fontWeight: 500, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
            <input type="checkbox" checked={selectedCount > 0} readOnly aria-label="Selected findings" />
            <span>Filename</span>
            <span>Class</span>
            <span style={{ textAlign: "right" }}>Size</span>
            <span>Status</span>
            <span />
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>            {props.error ? <InlineAlert message={props.error} /> : null}
            {!props.archiveRoot ? (
              <EmptyNotice>Pick an archive folder.</EmptyNotice>
            ) : !props.isAnalyzed ? (
              <EmptyNotice>Press {props.primaryAction.label} in the bottom bar.</EmptyNotice>
            ) : props.filteredRows.length === 0 ? (
              <EmptyNotice>{props.reviewRowCount === 0 ? `${emptyAnalysisHeadline}. ${emptyAnalysisDetail}` : "Adjust the filter rail or clear the current search to bring rows back into view."}</EmptyNotice>
            ) : (
              props.filteredRows.map((row) => (
                <ReviewQueueRow
                  key={row.key}
                  row={row}
                  expanded={expandedRowKey === row.key}
                  onToggle={() => setExpandedRowKey((current) => (current === row.key ? null : row.key))}
                />
              ))
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "10px 16px 14px", borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 10 }}>
            <span className="num">{formatNumber(props.counts.total)} total</span>
            <span className="num">{formatNumber(selectedCount)}/{formatNumber(props.counts.total)} selected</span>
            {props.counts.duplicate > 0 ? <span className="num" style={{ color: "var(--accent)" }}>{formatNumber(props.counts.duplicate)} exact-match cluster{props.counts.duplicate === 1 ? "" : "s"}</span> : null}
            {props.counts.misplaced > 0 ? <span className="num" style={{ color: "#8ba7ff" }}>{formatNumber(props.counts.misplaced)} misplaced</span> : null}
            {props.counts["zero-byte"] > 0 ? <span className="num" style={{ color: "var(--warn)" }}>{formatNumber(props.counts["zero-byte"])} zero-byte</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, background: "var(--surface-1)" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", textAlign: "left" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{sectionHeading(props.primaryAction.stage)}</span>
              <ChevronDownIcon color="var(--text-dim)" />
            </button>

            <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {stats.map((stat) => (
                  <div key={stat.label} style={{ minWidth: 0, padding: "4px 0 2px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{stat.label}</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3, minWidth: 0 }}>
                      <span className="num" style={{ fontSize: 24, lineHeight: 1, color: "var(--text)", letterSpacing: "-0.04em", whiteSpace: "nowrap" }}>{stat.value}</span>
                      {stat.suffix ? <span className="num" style={{ fontSize: 11, color: "var(--text-dim)" }}>{stat.suffix}</span> : null}
                    </div>
                    <span className="num" style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stat.detail}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {meters.map((meter) => (
                  <div key={meter.key} title={meter.level} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--text)", whiteSpace: "nowrap" }}>{meter.shortLabel}</span>
                      <span className="num" style={{ fontSize: 10, color: meter.tone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meter.level}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ width: `${meter.value}%`, height: "100%", borderRadius: 999, background: meter.tone }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {props.analysisSlot ? (
              <RightSection title="Analysis">{props.analysisSlot}</RightSection>
            ) : null}

            <RightSection title="Filter">
              <Field label="Scope" helper="Choose which findings stay in focus.">
                <SegmentedControl
                  options={Object.entries(filterLabels).map(([value, label]) => ({ value: value as DashboardSurfaceFilter, label }))}
                  active={props.filter}
                  onSelect={props.setFilter}
                />
              </Field>
            </RightSection>

            <RightSection title="Plan">
              <Field label="Action mix" helper="Curator builds reversible actions from the current findings.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <MetricPill label="Quarantine" value={formatNumber(props.proposalCounts.quarantine)} active={props.proposalCounts.quarantine > 0} />
                  <MetricPill label="Move" value={formatNumber(props.proposalCounts.move_to_year)} active={props.proposalCounts.move_to_year > 0} />
                </div>
              </Field>
              <Field label="Status" helper={stageText[props.primaryAction.stage]}>
                <div style={{ minHeight: 50, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--text)", fontSize: 12 }}>
                  {props.proposalCount > 0 ? "Plan ready to apply" : props.isAnalyzed ? "Build plan from findings" : "Analyze the archive first"}
                </div>
              </Field>
            </RightSection>

          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", background: "var(--surface-1)", position: "relative" }}>
        {props.footerBusy ? (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--border)", zIndex: 2 }}>
            <div style={{ width: "42%", height: "100%", background: props.primaryAction.stage === "apply" ? "var(--error)" : "var(--accent)", transition: "width 200ms linear" }} />
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: props.onReanalyze ? "92px 168px minmax(0, 1fr)" : "168px minmax(0, 1fr)" }}>
          {props.onReanalyze && (
            <button
              type="button"
              onClick={() => props.onReanalyze!()}
              disabled={props.footerBusy || props.reanalyzing}
              title="Re-analyze with current settings"
              style={{
                minHeight: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 500,
                border: "none",
                borderRight: "1px solid var(--border)",
                color: props.footerBusy || props.reanalyzing ? "var(--text-dim)" : "var(--text-muted)",
                background: "var(--surface-2)",
                cursor: props.footerBusy || props.reanalyzing ? "wait" : "pointer",
                transition: "all var(--t)",
              }}
            >
              {props.reanalyzing ? "..." : "Re-analyze"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void props.onPrimaryAction()}
            disabled={props.footerBusy}
            style={{
              minHeight: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              borderRight: "1px solid var(--border)",
              color: props.footerBusy ? "var(--text-dim)" : props.primaryAction.stage === "apply" ? "#fff" : "#0a0a0a",
              background: props.footerBusy ? "var(--surface-2)" : props.primaryAction.stage === "apply" ? "var(--error)" : "var(--accent)",
              boxShadow: props.primaryAction.stage === "apply" && !props.footerBusy ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
              transition: "all var(--t)",
            }}
          >
            <span>{props.footerBusy ? "Working..." : props.primaryAction.label}</span>
            {!props.footerBusy ? <ArrowRightIcon color={props.primaryAction.stage === "apply" ? "#fff" : "#0a0a0a"} /> : null}
          </button>

          <div style={{ minWidth: 0, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
            <div className="num" style={{ fontSize: 12, color: props.error ? "var(--error)" : "var(--text)" }}>{props.error ?? queueHeadline}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ minWidth: 0, fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{queueDetail}</div>
              {latestSession ? (
                <button type="button" onClick={() => props.onUndoTarget(latestSession)} disabled={props.footerBusy || props.undoingId !== null} style={textLinkStyle(props.footerBusy || props.undoingId !== null)}>
                  Undo last session
                </button>
              ) : props.isAnalyzed ? (
                <button type="button" onClick={() => void props.loadFindings()} disabled={props.footerBusy || props.refreshing} style={textLinkStyle(props.footerBusy || props.refreshing)}>
                  Refresh findings
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewQueueRow({ row, expanded, onToggle }: { row: ReviewRow; expanded: boolean; onToggle: () => void }): JSX.Element {
  const meta = kindMeta[row.kind];
  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: expanded ? "var(--surface-1)" : "transparent", transition: "background var(--t)" }}>
      <button type="button" title={row.title} onClick={onToggle} style={{ width: "100%", display: "grid", gridTemplateColumns: QUEUE_GRID_COLUMNS, alignItems: "center", padding: "10px 16px", cursor: "pointer", fontSize: 12, background: "transparent", border: "none", textAlign: "left" }}>
        <input type="checkbox" checked readOnly aria-label="Finding selected" />
        <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>{baseName(row.path)}</span>
        <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border-strong)", color: "var(--text-muted)", background: "var(--surface-1)", width: "fit-content", whiteSpace: "nowrap" }}>{meta.badge}</span>
        <span className="num" style={{ textAlign: "right", color: "var(--text-muted)", paddingRight: 16 }}>{rowSizeLabel(row)}</span>
        <span title={row.detail} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.tone, display: "inline-block", opacity: 0.9 }} />
          <span className="num" style={{ color: meta.tone, fontSize: 11 }}>{meta.status}</span>
        </span>
        <div style={{ display: "flex", justifyContent: "flex-end", color: "var(--text-dim)" }}>
          {expanded ? <ChevronUpIcon color="var(--text-dim)" /> : <ChevronDownIcon color="var(--text-dim)" />}
        </div>
      </button>

      {expanded ? (
        <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "84px 1fr", rowGap: 4, columnGap: 12, fontSize: 11, color: "var(--text-muted)", animation: "fadeIn 200ms ease-out" }}>
          <DetailRow label="Path" value={row.path} />
          <DetailRow label="Title" value={row.title} />
          <DetailRow label="Detail" value={row.detail} />
          <DetailRow label="Class" value={kindMeta[row.kind].badge} />
        </div>
      ) : null}
    </div>
  );
}

function PickerRow({ label, value, onPick, trailing, disabled }: { label: string; value: string | null; onPick: () => void; trailing?: ReactNode; disabled: boolean }): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) auto auto", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ width: 48, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 30, minWidth: 0, padding: "0 10px", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 4 }}>
        <FolderIcon />
        <span className="num" style={{ flex: 1, fontSize: 12, color: value ? "var(--text)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "-"}</span>
      </div>
      <button type="button" onClick={onPick} disabled={disabled} style={{ height: 30, padding: "0 12px", fontSize: 12, color: disabled ? "var(--text-dim)" : "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 4, background: "var(--surface-2)", opacity: disabled ? 0.45 : 1, transition: "all var(--t)" }}>
        Browse
      </button>
      {trailing || <div style={{ width: 30 }} />}
    </div>
  );
}function RightSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section style={{ padding: "14px 16px 18px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{title}</span>
        <ChevronDownIcon color="var(--text-dim)" />
      </div>
      {children}
    </section>
  );
}

function Field({ label, helper, children }: { label: string; helper: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>{helper}</span>
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, active, onSelect }: { options: { value: DashboardSurfaceFilter; label: string }[]; active: DashboardSurfaceFilter; onSelect: (value: DashboardSurfaceFilter) => void }): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <button key={option.value} type="button" onClick={() => onSelect(option.value)} style={{ minHeight: 34, padding: "0 10px", borderRadius: 4, border: "1px solid var(--border)", background: selected ? "var(--surface-3)" : "var(--surface-1)", color: selected ? "var(--text)" : "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "all var(--t)" }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricPill({ label, value, active }: { label: string; value: string; active: boolean }): JSX.Element {
  return (
    <div style={{ minHeight: 50, borderRadius: 6, border: "1px solid var(--border)", background: active ? "rgba(62, 207, 142, 0.06)" : "var(--surface-1)", padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span className="num" style={{ fontSize: 16, color: active ? "var(--accent)" : "var(--text)" }}>{value}</span>
    </div>
  );
}

function InlineAlert({ message }: { message: string }): JSX.Element {
  return <div style={{ margin: 16, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.10)", color: "#fca5a5", fontSize: 12 }}>{message}</div>;
}

function EmptyNotice({ children }: { children: ReactNode }): JSX.Element {
  return <div style={{ padding: 32, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>{children}</div>;
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <>
      <span style={{ color: "var(--text-dim)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", paddingTop: 2 }}>{label}</span>
      <span className="num" style={{ color: "var(--text)", wordBreak: "break-all" }}>{value}</span>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
      <span style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span className="num" style={{ color: "var(--text-muted)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function WindowBtn({ icon, onClick, danger, label }: { icon: ReactNode; onClick: () => void; danger?: boolean; label: string }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        background: hover ? (danger ? "var(--error)" : "var(--surface-3)") : "transparent",
        color: hover && danger ? "#fff" : "var(--text-muted)",
        transition: "all var(--t)",
      }}
    >
      {icon}
    </button>
  );
}

function Logo(): JSX.Element {
  return (
    <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-strong)", flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <rect x="1" y="1" width="2" height="10" fill="var(--text)" />
        <rect x="9" y="1" width="2" height="10" fill="var(--text)" />
        <rect x="4" y="3" width="4" height="1.5" fill="var(--accent)" />
        <rect x="4" y="7.5" width="4" height="1.5" fill="var(--accent)" />
      </svg>
    </div>
  );
}

function FolderIcon(): JSX.Element {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" stroke="var(--text-dim)" strokeWidth="1.5" /></svg>;
}

function RefreshIcon(): JSX.Element {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SearchIcon(): JSX.Element {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="11" cy="11" r="6.5" stroke="var(--text-dim)" strokeWidth="1.5" /><path d="M16 16l4 4" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}function ArrowRightIcon({ color }: { color: string }): JSX.Element {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14M13 5l7 7-7 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronDownIcon({ color }: { color: string }): JSX.Element {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 9l6 6 6-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronUpIcon({ color }: { color: string }): JSX.Element {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 15l6-6 6 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MinimizeIcon(): JSX.Element {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function MaximizeIcon(): JSX.Element {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function CloseIcon(): JSX.Element {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function compactMetric(bytes: number): { value: string; suffix: string } {
  if (bytes < 1024) return { value: String(bytes), suffix: "B" };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(bytes >= 1024 * 10 ? 0 : 1), suffix: "KB" };
  if (bytes < 1024 * 1024 * 1024) return { value: (bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 * 10 ? 0 : 1), suffix: "MB" };
  return { value: (bytes / 1024 / 1024 / 1024).toFixed(bytes >= 1024 * 1024 * 1024 * 10 ? 0 : 1), suffix: "GB" };
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

function rowSizeLabel(row: ReviewRow): string {
  if (row.kind === "zero-byte") return "0 B";
  return row.kind === "duplicate" ? "Cluster" : "Date";
}

function sectionHeading(stage: PrimaryActionState["stage"]): string {
  if (stage === "apply") return "Plan ready";
  if (stage === "build") return "Review";
  if (stage === "analyze") return "Analyze";
  return "Select";
}

function textLinkStyle(disabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 11,
    color: disabled ? "var(--text-dim)" : "var(--text-muted)",
    textDecoration: "underline",
    textDecorationColor: "var(--border-strong)",
    textUnderlineOffset: 3,
    opacity: disabled ? 0.45 : 1,
  };
}