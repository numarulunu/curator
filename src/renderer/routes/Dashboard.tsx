import { useEffect, useState } from "react";
import type { AppVersion, SidecarVersion } from "@shared/types";

export function Dashboard(): JSX.Element {
  const [app, setApp] = useState<AppVersion | null>(null);
  const [py, setPy] = useState<SidecarVersion | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setApp);
    window.curator.getSidecarVersion().then(setPy).catch(() => setPy(null));
    window.curator.ping().then(setOk).catch(() => setOk(false));
  }, []);

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">App: {app ? `Electron ${app.electron} • Node ${app.node}` : "…"}</p>
      <p className="text-muted-foreground">Sidecar: {py ? `${py.sidecar} • Python ${py.python}` : "…"}</p>
      <p className="text-muted-foreground">Ping: {ok == null ? "…" : ok ? "pong" : "FAILED"}</p>
    </div>
  );
}
