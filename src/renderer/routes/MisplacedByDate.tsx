import { useEffect, useMemo, useState } from "react";
import type { MisplacedFile } from "@shared/types";
import { NoArchiveState } from "../components/layout/NoArchiveState";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { MonoPath } from "../components/ui/MonoPath";
import { SkeletonRow } from "../components/ui/Skeleton";
import { SortableTH } from "../components/ui/SortableTH";
import { Stat } from "../components/ui/Stat";
import { Table, TD, THead, TR } from "../components/ui/Table";
import { stripIpcPrefix } from "../lib/curatorUi";
import { formatNumber } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

type SortKey = "path" | "folder_year" | "canonical_year" | "date_source";

export function MisplacedByDate(): JSX.Element {
  const { archiveRoot } = useArchive();
  const { push } = useToast();

  const [rows, setRows] = useState<MisplacedFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "canonical_year", dir: "asc" });

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setRows(await window.curator.listMisplaced());
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

  async function resolveDatesAndRefresh(): Promise<void> {
    setResolving(true);
    setError(null);
    try {
      await window.curator.resolveDates();
      await load();
      push({ kind: "success", title: "Dates resolved" });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Resolve failed", message });
    } finally {
      setResolving(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const dir = sort.dir === "asc" ? 1 : -1;
    const list = (rows ?? []).filter((row) => !needle || row.path.toLowerCase().includes(needle));
    return [...list].sort((a, b) => {
      if (sort.key === "path") return a.path.localeCompare(b.path) * dir;
      if (sort.key === "folder_year") return (a.folder_year - b.folder_year) * dir;
      if (sort.key === "canonical_year") return (a.canonical_year - b.canonical_year) * dir;
      return a.date_source.localeCompare(b.date_source) * dir;
    });
  }, [query, rows, sort]);

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.date_source, (counts.get(row.date_source) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [rows]);

  const setSortKey = (key: SortKey) => {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  if (!archiveRoot) {
    return (
      <div>
        <PageHeader eyebrow="Analysis" title="Misplaced Files" description="Files whose canonical date disagrees with their containing year folder." />
        <NoArchiveState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Misplaced Files"
        description="Canonical year does not match the containing folder year. Resolve dates first when metadata is stale, then review the proposed moves."
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => void resolveDatesAndRefresh()} loading={resolving} disabled={loading}>Resolve Dates</Button>
            <Button variant="ghost" size="md" onClick={() => void load()} loading={loading}>Refresh</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardBody><Stat label="Total" value={formatNumber(rows?.length ?? 0)} tone={(rows?.length ?? 0) > 0 ? "warn" : "muted"} /></CardBody></Card>
        {sources.map(([source, count]) => <Card key={source}><CardBody><Stat label={source} value={formatNumber(count)} tone="default" hint="Date source" /></CardBody></Card>)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <Input placeholder="Filter by path..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-[280px]" />
        </CardHeader>
        <CardBody className="p-0">
          <div className="max-h-[620px] overflow-auto">
            <Table>
              <THead>
                <tr>
                  <SortableTH sortKey="path" currentKey={sort.key} direction={sort.dir} onSort={setSortKey}>Path</SortableTH>
                  <SortableTH sortKey="folder_year" currentKey={sort.key} direction={sort.dir} onSort={setSortKey}>Folder</SortableTH>
                  <SortableTH sortKey="canonical_year" currentKey={sort.key} direction={sort.dir} onSort={setSortKey}>Canonical</SortableTH>
                  <SortableTH sortKey="date_source" currentKey={sort.key} direction={sort.dir} onSort={setSortKey}>Source</SortableTH>
                </tr>
              </THead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                ) : error ? (
                  <tr><td colSpan={4}><ErrorState message={error} onRetry={() => void load()} /></td></tr>
                ) : !rows || rows.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState title="No misplaced files" description="Every file already sits in the folder matching its canonical year." tone="success" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState title="No matches" description="Clear or refine the filter." /></td></tr>
                ) : (
                  filtered.map((row) => (
                    <TR key={row.id}>
                      <TD className="max-w-[520px]"><MonoPath path={row.path} /><div className="mt-1 font-mono text-[11px] text-neutral-600">{row.canonical_date}</div></TD>
                      <TD><Badge tone="muted" uppercase>{row.folder_year}</Badge></TD>
                      <TD><Badge tone="info" uppercase>{row.canonical_year}</Badge></TD>
                      <TD><span className="font-mono text-[11.5px] text-neutral-400">{row.date_source}</span></TD>
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
