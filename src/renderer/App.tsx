import { useEffect, useState } from "react";
import type { AppVersion } from "@shared/types";

export default function App(): JSX.Element {
  const [ver, setVer] = useState<AppVersion | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setVer);
  }, []);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Curator</h1>
      <p className="text-muted-foreground mt-2">
        {ver ? `Electron ${ver.electron} • Node ${ver.node}` : "Loading..."}
      </p>
    </div>
  );
}
