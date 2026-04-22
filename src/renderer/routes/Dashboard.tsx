import { useEffect, useState } from "react";
import type { AppVersion, ScanResult, SidecarVersion } from "@shared/types";

export function Dashboard(): JSX.Element {
  const [app, setApp] = useState<AppVersion | null>(null);
  const [py, setPy] = useState<SidecarVersion | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ scanned: number } | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setApp);
    window.curator.getSidecarVersion().then(setPy).catch(() => setPy(null));
    window.curator.ping().then(setOk).catch(() => setOk(false));
  }, []);

  useEffect(() => {
    const unsubscribe = window.curator.onEvent((params) => {
      if (params.kind === "scan.progress" && typeof params.scanned === "number") {
        setProgress({ scanned: params.scanned });
      }
    });
    return unsubscribe;
  }, []);

  async function onPickFolder(): Promise<void> {
    const picked = await window.curator.pickFolder();
    if (picked) {
      setSelectedRoot(picked);
      setResult(null);
      setError(null);
    }
  }

  async function onStartScan(): Promise<void> {
    if (!selectedRoot) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const r = await window.curator.scan(selectedRoot);
      setResult(r);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      const clean = raw.replace(/^Error invoking remote method '[^']+':\s*/, "");
      setError(clean);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">App: {app ? `Electron ${app.electron} • Node ${app.node}` : "…"}</p>
      <p className="text-muted-foreground">Sidecar: {py ? `${py.sidecar} • Python ${py.python}` : "…"}</p>
      <p className="text-muted-foreground">Ping: {ok == null ? "…" : ok ? "pong" : "FAILED"}</p>

      <section className="pt-6 space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Scan archive</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPickFolder}
            className="px-4 py-2 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            Choose folder…
          </button>
          <button
            type="button"
            onClick={onStartScan}
            disabled={!selectedRoot || busy}
            className="px-4 py-2 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? (progress ? `Scanning… ${progress.scanned} files so far` : "Scanning…") : "Start scan"}
          </button>
        </div>
        <p className="text-muted-foreground truncate">
          Folder: {selectedRoot ?? "(none selected)"}
        </p>
        {result && (
          <p className="text-muted-foreground">
            Scanned {result.scanned} files in {result.root}
          </p>
        )}
        {error && (
          <p className="text-red-400">Error: {error}</p>
        )}
      </section>
    </div>
  );
}
