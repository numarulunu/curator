import { useEffect, useMemo, useState } from "react";
import type { Session } from "@shared/types";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { SkeletonRow } from "../components/ui/Skeleton";
import { Stat } from "../components/ui/Stat";
import { Table, TD, TH, THead, TR } from "../components/ui/Table";
import { sessionStatus, stripIpcPrefix } from "../lib/curatorUi";
import { formatDateTime, formatDuration, formatNumber, shortHash } from "../lib/format";
import { useToast } from "../state/ToastContext";

export function Sessions(): JSX.Element {
  const { push } = useToast();

  const [rows, setRows] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [target, setTarget] = useState<Session | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setRows(await window.curator.listSessions());
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Load failed", message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function undo(session: Session): Promise<void> {
    setUndoingId(session.id);
    setError(null);
    try {
      await window.curator.undoSession(session.id);
      push({ kind: "success", title: "Session undone", message: `${session.action_count} action${session.action_count === 1 ? "" : "s"} reverted.` });
      setTarget(null);
      await load();
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Undo failed", message });
    } finally {
      setUndoingId(null);
    }
  }

  const totals = useMemo(() => {
    return (rows ?? []).reduce(
      (acc, row) => {
        acc.total += 1;
        acc.actions += row.action_count;
        if (sessionStatus(row) === "active") acc.active += 1;
        return acc;
      },
      { total: 0, active: 0, actions: 0 },
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(rows ?? [])]
      .filter((row) => !needle || row.id.toLowerCase().includes(needle) || row.kind.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }, [query, rows]);

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="Sessions"
        description="Every apply run is recorded as a session. Undo reverses all filesystem operations from a session in one step."
        actions={<Button variant="outline" size="md" onClick={() => void load()} loading={loading}>Refresh</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardBody><Stat label="Total Sessions" value={formatNumber(totals.total)} tone={totals.total ? "default" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Active" value={formatNumber(totals.active)} tone={totals.active ? "info" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Total Actions" value={formatNumber(totals.actions)} tone={totals.actions ? "default" : "muted"} /></CardBody></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <Input placeholder="Filter by id or kind..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-[280px]" />
        </CardHeader>
        <CardBody className="p-0">
          <div className="max-h-[620px] overflow-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Session</TH>
                  <TH>Kind</TH>
                  <TH>Started</TH>
                  <TH>Duration</TH>
                  <TH className="text-right">Actions</TH>
                  <TH className="text-right">Status</TH>
                  <TH className="text-right">Undo</TH>
                </tr>
              </THead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : error ? (
                  <tr><td colSpan={7}><ErrorState message={error} onRetry={() => void load()} /></td></tr>
                ) : !rows || rows.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No sessions yet" description="A session appears here the first time you apply a plan." /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No matches" description="Clear or refine the filter." /></td></tr>
                ) : (
                  filtered.map((row) => {
                    const status = sessionStatus(row);
                    return (
                      <TR key={row.id}>
                        <TD className="font-mono text-[11.5px] text-neutral-300">{shortHash(row.id, 8, 6)}</TD>
                        <TD><Badge tone="muted" uppercase>{row.kind}</Badge></TD>
                        <TD className="font-mono text-[11.5px] text-neutral-400">{formatDateTime(row.started_at)}</TD>
                        <TD className="font-mono text-[11.5px] text-neutral-400">{formatDuration(row.started_at, row.completed_at)}</TD>
                        <TD className="text-right font-mono text-[12px] text-neutral-200">{formatNumber(row.action_count)}</TD>
                        <TD className="text-right">{status === "active" ? <Badge tone="info" uppercase>Active</Badge> : <Badge tone="success" uppercase>Complete</Badge>}</TD>
                        <TD className="text-right"><Button variant="ghost" size="sm" onClick={() => setTarget(row)} disabled={status === "active" || undoingId !== null} loading={undoingId === row.id}>Undo</Button></TD>
                      </TR>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={target !== null}
        onClose={() => (undoingId ? null : setTarget(null))}
        onConfirm={() => target ? void undo(target) : undefined}
        title="Undo this session?"
        tone="danger"
        destructive
        loading={undoingId !== null}
        confirmLabel={undoingId ? "Undoing..." : "Undo Session"}
        description={
          target ? (
            <div className="space-y-2">
              <p>This will reverse all {target.action_count} filesystem action{target.action_count === 1 ? "" : "s"} recorded in this session.</p>
              <p className="font-mono text-[12px] text-neutral-400">{target.id}</p>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
