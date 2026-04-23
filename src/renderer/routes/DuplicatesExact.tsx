import { useEffect, useMemo, useState } from "react";
import type { DuplicateCluster } from "@shared/types";
import { NoArchiveState } from "../components/layout/NoArchiveState";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { MonoPath } from "../components/ui/MonoPath";
import { Skeleton } from "../components/ui/Skeleton";
import { Stat } from "../components/ui/Stat";
import { useCuratorEvents } from "../hooks/useCuratorEvents";
import { stripIpcPrefix } from "../lib/curatorUi";
import { formatBytes, formatNumber, shortHash } from "../lib/format";
import { useArchive } from "../state/ArchiveContext";
import { useToast } from "../state/ToastContext";

type SortKey = "waste" | "size" | "count";

export function DuplicatesExact(): JSX.Element {
  const { archiveRoot } = useArchive();
  const { push } = useToast();
  const event = useCuratorEvents();

  const [clusters, setClusters] = useState<DuplicateCluster[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "waste", dir: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      if (!archiveRoot) return;
      setClusters(await window.curator.duplicatesExact(archiveRoot));
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

  async function onHash(): Promise<void> {
    setHashing(true);
    setError(null);
    try {
      if (!archiveRoot) return;
      await window.curator.hashAll(archiveRoot);
      await load();
      push({ kind: "success", title: "Hashes complete" });
    } catch (err) {
      const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));
      setError(message);
      push({ kind: "error", title: "Hashing failed", message });
    } finally {
      setHashing(false);
    }
  }

  const totals = useMemo(() => {
    return (clusters ?? []).reduce(
      (acc, cluster) => {
        acc.clusters += 1;
        acc.files += cluster.count;
        acc.reclaimable += Math.max(0, cluster.count - 1) * cluster.size;
        return acc;
      },
      { clusters: 0, files: 0, reclaimable: 0 },
    );
  }, [clusters]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const dir = sort.dir === "asc" ? 1 : -1;
    const list = (clusters ?? []).filter((cluster) => {
      if (!needle) return true;
      return cluster.xxhash.toLowerCase().includes(needle) || cluster.files.some((file) => file.path.toLowerCase().includes(needle));
    });
    return [...list].sort((a, b) => {
      if (sort.key === "size") return (a.size - b.size) * dir;
      if (sort.key === "count") return (a.count - b.count) * dir;
      return (Math.max(0, a.count - 1) * a.size - Math.max(0, b.count - 1) * b.size) * dir;
    });
  }, [clusters, query, sort]);

  const hashProgress = event?.kind === "hash.progress" && typeof event.hashed === "number" && typeof event.total === "number"
    ? `${event.hashed} / ${event.total}`
    : null;

  if (!archiveRoot) {
    return (
      <div>
        <PageHeader eyebrow="Analysis" title="Exact Duplicates" description="Files sharing identical xxhash fingerprints." />
        <NoArchiveState />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Analysis"
        title="Exact Duplicates"
        description="Content-identical files grouped by xxhash. Use Apply to quarantine redundant copies without touching the keeper manually."
        actions={
          <>
            {hashProgress ? <Badge tone="info" uppercase>{hashProgress}</Badge> : null}
            <Button variant="outline" size="md" onClick={() => void onHash()} loading={hashing} disabled={loading}>Compute Hashes</Button>
            <Button variant="ghost" size="md" onClick={() => void load()} loading={loading}>Refresh</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card><CardBody><Stat label="Clusters" value={formatNumber(totals.clusters)} tone={totals.clusters ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Files" value={formatNumber(totals.files)} tone={totals.files ? "warn" : "muted"} /></CardBody></Card>
        <Card><CardBody><Stat label="Reclaimable" value={formatBytes(totals.reclaimable)} tone={totals.reclaimable ? "warn" : "muted"} hint="Bytes recoverable if all but one copy per cluster are quarantined" /></CardBody></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Clusters</CardTitle>
            <div className="flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
              {(["waste", "size", "count"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" })}
                  className={"rounded px-2.5 py-1 text-[11.5px] uppercase tracking-[0.1em] transition-colors " + (sort.key === key ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300")}
                >
                  {key === "waste" ? "Reclaimable" : key === "size" ? "Size" : "Count"}
                  {sort.key === key ? (sort.dir === "asc" ? " ^" : " v") : ""}
                </button>
              ))}
            </div>
          </div>
          <Input placeholder="Filter by hash or path..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-[280px]" />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : !clusters || clusters.length === 0 ? (
            <EmptyState title="No duplicates found" description="Every file currently has a unique content fingerprint." tone="success" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches" description="Clear or refine the filter to see more clusters." />
          ) : (
            <ul className="divide-y divide-neutral-900">
              {filtered.map((cluster) => {
                const open = expanded.has(cluster.xxhash);
                const reclaimable = Math.max(0, cluster.count - 1) * cluster.size;
                return (
                  <li key={cluster.xxhash}>
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(cluster.xxhash)) next.delete(cluster.xxhash);
                        else next.add(cluster.xxhash);
                        return next;
                      })}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-neutral-900/40"
                    >
                      <span className="inline-block font-mono text-[10px] text-neutral-600">{open ? "v" : ">"}</span>
                      <span title={cluster.xxhash} className="font-mono text-[11.5px] text-neutral-300">{shortHash(cluster.xxhash, 10, 8)}</span>
                      <div className="ml-auto flex items-center gap-5">
                        <div className="text-right"><div className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Size</div><div className="font-mono text-[12px] text-neutral-300">{formatBytes(cluster.size)}</div></div>
                        <div className="text-right"><div className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Copies</div><div className="font-mono text-[12px] text-neutral-300">{cluster.count}</div></div>
                        <div className="text-right"><div className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">Reclaim</div><div className="font-mono text-[12px] text-amber-400">{formatBytes(reclaimable)}</div></div>
                        <Badge tone={cluster.count > 2 ? "warn" : "default"} uppercase>{cluster.count}x</Badge>
                      </div>
                    </button>
                    {open ? (
                      <div className="border-t border-neutral-900 bg-neutral-950/60 px-4 py-3">
                        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-600">Files in cluster</div>
                        <ul className="space-y-3">
                          {cluster.files.map((file) => (
                            <li key={file.id} className="space-y-1.5">
                              <MonoPath path={file.path} />
                              <div className="flex gap-4 font-mono text-[11px] text-neutral-600">
                                <span>{formatBytes(file.size)}</span>
                                <span>{new Date(file.mtime_ns / 1e6).toLocaleString()}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
