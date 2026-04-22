import { useEffect, useMemo, useState } from "react";
import type { ZeroByteFile } from "@shared/types";
import { NoArchiveState } from "../components/layout/NoArchiveState";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { MonoPath } from "../components/ui/MonoPath";
import { SkeletonRow } from "../components/ui/Skeleton";
import { Stat } from "../components/ui/Stat";
import { Table, TD, TH, THead, TR } from "../components/ui/Table";
import { stripIpcPrefix } from "../lib/curatorUi";
import { formatNumber } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

export function ZeroByte(): JSX.Element {
  const { archiveRoot } = useArchive();
  const { push } = useToast();

  const [rows, setRows] = useState<ZeroByteFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setRows(await window.curator.listZeroByte());
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Load failed", message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!archiveRoot) return;
    void load();
  }, [archiveRoot]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(rows ?? [])].filter((row) => !needle || row.path.toLowerCase().includes(needle)).sort((a, b) => a.path.localeCompare(b.path));
  }, [query, rows]);

  if (!archiveRoot) {
    return (
      <div>
        <PageHeader eyebrow="Analysis" title="Zero-byte Files" description="Empty files detected during scan." />
        <NoArchiveState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Zero-byte Files"
        description="Empty files usually represent interrupted copies, placeholders, or partial corruption. Review them before applying any quarantine plan."
        actions={<Button variant="outline" size="md" onClick={() => void load()} loading={loading}>Refresh</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card><CardBody><Stat label="Zero-byte Files" value={formatNumber(rows?.length ?? 0)} tone={(rows?.length ?? 0) > 0 ? "warn" : "muted"} hint="Files with exactly 0 bytes on disk" /></CardBody></Card>
        <Card><CardBody><Stat label="Reclaimable" value="0 B" tone="muted" hint="Only metadata is occupied, but the files are operationally useless" /></CardBody></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <Input placeholder="Filter by path..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-[280px]" />
        </CardHeader>
        <CardBody className="p-0">
          <div className="max-h-[620px] overflow-auto">
            <Table>
              <THead><tr><TH className="w-10">#</TH><TH>Path</TH></tr></THead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={2} />)
                ) : error ? (
                  <tr><td colSpan={2}><ErrorState message={error} onRetry={() => void load()} /></td></tr>
                ) : !rows || rows.length === 0 ? (
                  <tr><td colSpan={2}><EmptyState title="No zero-byte files" description="Every indexed file carries at least one byte." tone="success" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={2}><EmptyState title="No matches" description="Clear or refine the filter." /></td></tr>
                ) : (
                  filtered.map((row, index) => (
                    <TR key={row.id}>
                      <TD className="font-mono text-[11px] text-neutral-700">{String(index + 1).padStart(3, "0")}</TD>
                      <TD><MonoPath path={row.path} /></TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
