import { useEffect, useMemo, useState } from "react";
import type { DuplicateCluster } from "@shared/types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function stripIpcPrefix(raw: string): string {
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, "");
}

export function DuplicatesExact(): JSX.Element {
  const [clusters, setClusters] = useState<DuplicateCluster[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hashing, setHashing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hashProgress, setHashProgress] = useState<{ hashed: number; total: number } | null>(null);

  async function loadClusters(): Promise<void> {
    try {
      const data = await window.curator.duplicatesExact();
      setClusters(data);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(stripIpcPrefix(raw));
      setClusters([]);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      await loadClusters();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = window.curator.onEvent((params) => {
      if (params.kind === "hash.progress") {
        const hashed = typeof params.hashed === "number" ? params.hashed : 0;
        const total = typeof params.total === "number" ? params.total : 0;
        setHashProgress({ hashed, total });
      }
    });
    return unsubscribe;
  }, []);

  async function onComputeHashes(): Promise<void> {
    setHashing(true);
    setError(null);
    setHashProgress(null);
    try {
      await window.curator.hashAll();
      await loadClusters();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(stripIpcPrefix(raw));
    } finally {
      setHashing(false);
    }
  }

  function toggle(xxhash: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(xxhash)) next.delete(xxhash);
      else next.add(xxhash);
      return next;
    });
  }

  const totals = useMemo(() => {
    if (!clusters) return { clusters: 0, files: 0 };
    let files = 0;
    for (const c of clusters) files += c.count;
    return { clusters: clusters.length, files };
  }, [clusters]);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Exact duplicates</h1>
        {clusters && (
          <span className="text-sm text-muted-foreground">
            {totals.clusters} clusters, {totals.files} files
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onComputeHashes}
          disabled={hashing}
          className="px-4 py-2 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
        >
          {hashing ? "Hashing…" : "Compute hashes"}
        </button>
        {hashing && hashProgress && (
          <span className="text-muted-foreground">
            Hashing… {hashProgress.hashed} / {hashProgress.total}
          </span>
        )}
      </div>

      {error && <p className="text-red-400">Error: {error}</p>}

      {loading && <p className="text-muted-foreground">Loading…</p>}

      {!loading && clusters && clusters.length === 0 && !error && (
        <p className="text-muted-foreground">No exact duplicates found.</p>
      )}

      {!loading && clusters && clusters.length > 0 && (
        <ul className="space-y-2">
          {clusters.map((c) => {
            const isOpen = expanded.has(c.xxhash);
            return (
              <li key={c.xxhash} className="rounded border border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggle(c.xxhash)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-zinc-900/60"
                >
                  <span className="font-mono text-sm text-zinc-300">
                    {c.xxhash.slice(0, 12)}…
                  </span>
                  <span className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{formatBytes(c.size)}</span>
                    <span>{c.count} files</span>
                    <span className="text-zinc-500">{isOpen ? "▾" : "▸"}</span>
                  </span>
                </button>
                {isOpen && (
                  <ul className="border-t border-zinc-800 divide-y divide-zinc-800/60">
                    {c.files.map((f) => (
                      <li key={f.id} className="px-4 py-2 flex items-center justify-between gap-4 text-sm">
                        <span className="truncate max-w-[60ch] text-zinc-300" title={f.path}>
                          {f.path}
                        </span>
                        <span className="flex items-center gap-4 text-muted-foreground">
                          <span>{formatBytes(f.size)}</span>
                          <span>{new Date(f.mtime_ns / 1e6).toLocaleString()}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
