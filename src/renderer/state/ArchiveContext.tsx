import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ArchiveContextValue {
  archiveRoot: string | null;
  setArchiveRoot: (root: string | null) => void;
  pickArchive: () => Promise<string | null>;
}

const STORAGE_KEY = "curator.archiveRoot";
const Ctx = createContext<ArchiveContextValue | null>(null);

function initialArchiveRoot(): string | null {
  const e2eRoot = window.__CURATOR_E2E_ROOT__;
  if (typeof e2eRoot === "string" && e2eRoot.length > 0) return e2eRoot;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [archiveRoot, setArchiveRootState] = useState<string | null>(initialArchiveRoot);

  useEffect(() => {
    try {
      if (archiveRoot) localStorage.setItem(STORAGE_KEY, archiveRoot);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage failures in packaged/browser-constrained contexts.
    }
  }, [archiveRoot]);

  const setArchiveRoot = useCallback((root: string | null) => {
    setArchiveRootState(root);
  }, []);

  const pickArchive = useCallback(async () => {
    const picked = await window.curator.pickFolder();
    if (picked) setArchiveRootState(picked);
    return picked;
  }, []);

  const value = useMemo(
    () => ({ archiveRoot, setArchiveRoot, pickArchive }),
    [archiveRoot, pickArchive, setArchiveRoot],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useArchive(): ArchiveContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useArchive must be used within ArchiveProvider");
  return value;
}
