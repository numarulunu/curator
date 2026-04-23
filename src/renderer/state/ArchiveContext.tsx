import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ArchivePrefs {
  archiveRoot: string | null;
  outputRoot: string | null;
}

interface ArchiveContextValue extends ArchivePrefs {
  setArchiveRoot: (root: string | null) => void;
  setOutputRoot: (root: string | null) => void;
  pickArchive: () => Promise<string | null>;
  pickOutput: () => Promise<string | null>;
}

const ARCHIVE_STORAGE_KEY = "curator.archiveRoot";
const OUTPUT_STORAGE_KEY = "curator.outputRoot";
const Ctx = createContext<ArchiveContextValue | null>(null);

export function loadStoredArchivePrefs(): ArchivePrefs {
  const e2eRoot = window.__CURATOR_E2E_ROOT__;
  if (typeof e2eRoot === "string" && e2eRoot.length > 0) {
    return { archiveRoot: e2eRoot, outputRoot: null };
  }

  try {
    return {
      archiveRoot: localStorage.getItem(ARCHIVE_STORAGE_KEY),
      outputRoot: localStorage.getItem(OUTPUT_STORAGE_KEY),
    };
  } catch {
    return { archiveRoot: null, outputRoot: null };
  }
}

export function saveStoredArchivePrefs(prefs: ArchivePrefs): void {
  try {
    if (prefs.archiveRoot) localStorage.setItem(ARCHIVE_STORAGE_KEY, prefs.archiveRoot);
    else localStorage.removeItem(ARCHIVE_STORAGE_KEY);

    if (prefs.outputRoot) localStorage.setItem(OUTPUT_STORAGE_KEY, prefs.outputRoot);
    else localStorage.removeItem(OUTPUT_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures in packaged/browser-constrained contexts.
  }
}

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<ArchivePrefs>(loadStoredArchivePrefs);

  useEffect(() => {
    saveStoredArchivePrefs(prefs);
  }, [prefs]);

  const setArchiveRoot = useCallback((root: string | null) => {
    setPrefs((current) => ({ ...current, archiveRoot: root }));
  }, []);

  const setOutputRoot = useCallback((root: string | null) => {
    setPrefs((current) => ({ ...current, outputRoot: root }));
  }, []);

  const pickArchive = useCallback(async () => {
    const picked = await window.curator.pickFolder();
    if (picked) setPrefs((current) => ({ ...current, archiveRoot: picked }));
    return picked;
  }, []);

  const pickOutput = useCallback(async () => {
    const picked = await window.curator.pickFolder();
    if (picked) setPrefs((current) => ({ ...current, outputRoot: picked }));
    return picked;
  }, []);

  const value = useMemo(
    () => ({ ...prefs, setArchiveRoot, setOutputRoot, pickArchive, pickOutput }),
    [pickArchive, pickOutput, prefs, setArchiveRoot, setOutputRoot],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useArchive(): ArchiveContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useArchive must be used within ArchiveProvider");
  return value;
}
