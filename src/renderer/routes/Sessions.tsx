import { useEffect, useState } from "react";
import type { Session } from "@shared/types";

export function Sessions(): JSX.Element {
  const [rows, setRows] = useState<Session[] | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setRows(await window.curator.listSessions());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function undo(id: string): Promise<void> {
    if (!window.confirm(`Undo session ${id}?`)) return;
    setWorkingId(id);
    setError(null);
    try {
      await window.curator.undoSession(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {rows == null ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-muted-foreground">No sessions yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Started</th>
              <th>Completed</th>
              <th>Kind</th>
              <th>Actions</th>
              <th>ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="py-2">{row.started_at}</td>
                <td>{row.completed_at ?? "-"}</td>
                <td>{row.kind}</td>
                <td>{row.action_count}</td>
                <td className="font-mono text-xs break-all pr-3">{row.id}</td>
                <td>
                  <button
                    onClick={() => void undo(row.id)}
                    disabled={workingId === row.id}
                    className="border border-border rounded-md px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {workingId === row.id ? "Undoing..." : "Undo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
