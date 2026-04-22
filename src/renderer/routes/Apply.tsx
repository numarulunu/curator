import { useState } from "react";
import type { ApplyResult, Proposal } from "@shared/types";

export function Apply(): JSX.Element {
  const [archiveRoot, setArchiveRoot] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(): Promise<void> {
    const picked = await window.curator.pickFolder();
    if (!picked) return;
    setArchiveRoot(picked);
    setProposals(null);
    setResult(null);
    setError(null);
  }

  async function loadProposals(): Promise<void> {
    if (!archiveRoot) return;
    setError(null);
    try {
      const next = await window.curator.buildProposals(archiveRoot);
      setProposals(next);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runApply(): Promise<void> {
    if (!archiveRoot || !proposals) return;
    setWorking(true);
    setError(null);
    try {
      const next = await window.curator.applyProposals(archiveRoot, proposals);
      setResult(next);
      setProposals(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Apply</h1>
      <div className="flex gap-2 items-center">
        <button onClick={() => void pick()} className="border border-border rounded-md px-3 py-2 text-sm">
          Pick archive
        </button>
        <div className="text-sm font-mono text-muted-foreground break-all">{archiveRoot || "(none)"}</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void loadProposals()}
          disabled={!archiveRoot || working}
          className="border border-border rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          Build proposals
        </button>
        <button
          onClick={() => void runApply()}
          disabled={!proposals || working}
          className="bg-accent text-accent-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          {working ? "Applying..." : `Apply ${proposals?.length ?? 0} actions`}
        </button>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {proposals && (
        proposals.length === 0 ? (
          <div className="text-sm text-muted-foreground">No proposals to apply.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Action</th>
                <th>Source</th>
                <th>Target</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal, index) => (
                <tr key={`${proposal.action}-${proposal.src_path}-${index}`} className="border-t border-border align-top">
                  <td className="py-2">{proposal.action}</td>
                  <td className="font-mono break-all pr-3">{proposal.src_path}</td>
                  <td className="font-mono break-all pr-3">{proposal.dst_path ?? "-"}</td>
                  <td className="text-muted-foreground">{proposal.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
      {result && (
        <div className="border border-border rounded-md p-4 space-y-1">
          <div>
            Session: <span className="font-mono">{result.session_id}</span>
          </div>
          <div>OK: {result.ok} - Failed: {result.failed}</div>
          {result.errors && result.errors.length > 0 && (
            <ul className="text-sm text-red-400 space-y-1">
              {result.errors.map((entry) => (
                <li key={`${entry.src}-${entry.error}`} className="font-mono break-all">
                  {entry.src}: {entry.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
