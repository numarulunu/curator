export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };
export type DuplicateFile = { id: number; path: string; size: number; mtime_ns: number };
export type DuplicateCluster = { xxhash: string; size: number; count: number; files: DuplicateFile[] };
export type HashAllResult = { hashed: number; skipped: number };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  scan: (root: string) => Promise<ScanResult>;
  hashAll: () => Promise<HashAllResult>;
  duplicatesExact: () => Promise<DuplicateCluster[]>;
  onEvent: (listener: (params: { kind: string; [k: string]: unknown }) => void) => () => void;
}

declare global {
  interface Window {
    curator: CuratorApi;
    __CURATOR_E2E_ROOT__: string | null;
  }
}
