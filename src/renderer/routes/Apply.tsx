import { useMemo, useState } from "react";
import type { ApplyResult, Proposal, ProposalAction } from "@shared/types";
import { NoArchiveState } from "../components/layout/NoArchiveState";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { MonoPath } from "../components/ui/MonoPath";
import { Stat } from "../components/ui/Stat";
import { countProposalActions, stripIpcPrefix } from "../lib/curatorUi";
import { formatNumber } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

const actionTone: Record<ProposalAction, "warn" | "info"> = {
  quarantine: "warn",
  move_to_year: "info",
};

const actionLabel: Record<ProposalAction, string> = {
  quarantine: "Quarantine",
  move_to_year: "Move to Year",
};

export function Apply(): JSX.Element {
  const { archiveRoot } = useArchive();
  const { push } = useToast();

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function build(): Promise<void> {
    if (!archiveRoot) return;
    setBuilding(true);
    setError(null);
    setResult(null);
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

  async function apply(): Promise<void> {
    if (!archiveRoot || !proposals || proposals.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const next = await window.curator.applyProposals(archiveRoot, proposals);
      setResult(next);
      setProposals(null);
      setConfirmOpen(false);
      push({ kind: "success", title: "Plan applied", message: `Session ${next.session_id} recorded.` });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Apply failed", message });
    } finally {
      setApplying(false);
    }
  }

  const counts = useMemo(() => countProposalActions(proposals ?? []), [proposals]);

  if (!archiveRoot) {
    return (
      <div>
        <PageHeader eyebrow="Execution" title="Apply" description="Build and apply a cleanup plan." />
        <NoArchiveState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Execution"
        title="Apply"
        description="Curator does nothing destructive until you explicitly apply a plan. Every apply run is recorded as a reversible session."
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => void build()} loading={building} disabled={applying}>Build Plan</Button>
            <Button variant="danger" size="md" onClick={() => setConfirmOpen(true)} disabled={!proposals || proposals.length === 0 || building} loading={applying}>Apply Plan</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardBody><Stat label="Total Actions" value={formatNumber(proposals?.length ?? 0)} tone={(proposals?.length ?? 0) > 0 ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Quarantine" value={formatNumber(counts.quarantine)} tone={counts.quarantine ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Move to Year" value={formatNumber(counts.move_to_year)} tone={counts.move_to_year ? "info" : "muted"} /></CardBody></Card>
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Target Archive</CardTitle>
          <Badge tone="muted" uppercase>Live Path</Badge>
        </CardHeader>
        <CardBody>
          <MonoPath path={archiveRoot} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preflight Plan</CardTitle>
          {proposals && proposals.length > 0 ? <Badge tone="warn" uppercase>{proposals.length} actions</Badge> : null}
        </CardHeader>
        <CardBody className="p-0">
          {building ? (
            <div className="p-6 text-[12.5px] text-neutral-500">Building proposals...</div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void build()} />
          ) : proposals === null ? (
            <EmptyState title="No plan built yet" description="Build proposals first. Curator will review duplicates, misplaced files, and zero-byte files from the current archive." />
          ) : proposals.length === 0 ? (
            <EmptyState title="Nothing to do" description="No apply actions were generated for the current archive state." tone="success" />
          ) : (
            <ul className="divide-y divide-neutral-900">
              {proposals.map((proposal, index) => (
                <li key={`${proposal.action}-${proposal.src_path}-${index}`} className="px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={actionTone[proposal.action]} uppercase>{actionLabel[proposal.action]}</Badge>
                    <span className="text-[12px] text-neutral-500">{proposal.reason}</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Source</div>
                      <MonoPath path={proposal.src_path} />
                    </div>
                    {proposal.dst_path ? (
                      <div>
                        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Target</div>
                        <MonoPath path={proposal.dst_path} />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {result ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Apply Result</CardTitle>
            <Badge tone={result.failed > 0 ? "warn" : "success"} uppercase>{result.failed > 0 ? "Partial" : "Complete"}</Badge>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="font-mono text-[12px] text-neutral-400">Session: {result.session_id}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Stat label="Applied" value={formatNumber(result.ok)} tone={result.ok > 0 ? "success" : "muted"} />
              <Stat label="Failed" value={formatNumber(result.failed)} tone={result.failed > 0 ? "danger" : "muted"} />
            </div>
            {result.errors && result.errors.length > 0 ? (
              <ul className="space-y-2 rounded-md border border-rose-900/50 bg-rose-950/20 p-4">
                {result.errors.map((entry) => (
                  <li key={`${entry.src}-${entry.error}`} className="space-y-1">
                    <MonoPath path={entry.src} />
                    <div className="font-mono text-[11px] text-rose-300">{entry.error}</div>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => (applying ? null : setConfirmOpen(false))}
        onConfirm={() => void apply()}
        title="Apply this cleanup plan?"
        tone="danger"
        destructive
        loading={applying}
        confirmLabel={applying ? "Applying..." : "Apply Plan"}
        description={
          <div className="space-y-2">
            <p>This will move files on disk under the current archive root and create an undo session.</p>
            <p>Review the proposal list carefully before confirming.</p>
          </div>
        }
      />
    </div>
  );
}
