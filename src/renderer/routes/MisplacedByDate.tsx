import { useEffect, useState } from "react";
import type { MisplacedFile } from "@shared/types";

export function MisplacedByDate(): JSX.Element {
  const [rows, setRows] = useState<MisplacedFile[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const list = await window.curator.listMisplaced();
      setRows(list);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(raw.replace(/^Error invoking remote method '[^']+':\s*/, ""));
    }
  }

  useEffect(() => { load(); }, []);

  async function onResolveAndList() {
    setWorking(true);
    setError(null);
    try {
      await window.curator.resolveDates();
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(raw.replace(/^Error invoking remote method '[^']+':\s*/, ""));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Misplaced by date</h1>
        <button
          type="button"
          onClick={onResolveAndList}
          disabled={working || rows === null}
          className="px-4 py-2 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
        >
          {working ? "Resolving…" : "Resolve dates + list"}
        </button>
      </div>
      {error && <p className="text-red-400">Error: {error}</p>}
      {rows === null ? (
        <p className="text-zinc-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-400">No misplaced files.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-2 font-normal">Path</th>
              <th className="font-normal">Folder</th>
              <th className="font-normal">Canonical</th>
              <th className="font-normal">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="py-2 font-mono break-all" title={r.path}>{r.path}</td>
                <td>{r.folder_year}</td>
                <td>{r.canonical_year}</td>
                <td className="text-zinc-500">{r.date_source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
