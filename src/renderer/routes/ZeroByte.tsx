import { useEffect, useState } from "react";
import type { ZeroByteFile } from "@shared/types";

export function ZeroByte(): JSX.Element {
  const [rows, setRows] = useState<ZeroByteFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.curator.listZeroByte()
      .then(setRows)
      .catch((e: unknown) => {
        const raw = e instanceof Error ? e.message : String(e);
        setError(raw.replace(/^Error invoking remote method '[^']+':\s*/, ""));
        setRows([]);
      });
  }, []);

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Zero-byte files</h1>
      {error && <p className="text-red-400">Error: {error}</p>}
      {rows === null ? (
        <p className="text-zinc-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-400">No zero-byte files.</p>
      ) : (
        <>
          <p className="text-zinc-500 text-sm">{rows.length} zero-byte file{rows.length === 1 ? "" : "s"}</p>
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="text-sm font-mono break-all" title={r.path}>{r.path}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
