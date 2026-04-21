import { useEffect, useState } from "react";
import type { AppVersion } from "@shared/types";

export function Dashboard(): JSX.Element {
  const [ver, setVer] = useState<AppVersion | null>(null);
  useEffect(() => { window.curator.getVersion().then(setVer); }, []);
  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        {ver ? `Electron ${ver.electron} • Node ${ver.node}` : "Loading..."}
      </p>
    </div>
  );
}
