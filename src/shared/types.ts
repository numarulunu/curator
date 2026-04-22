export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };
export type DuplicateFile = { id: number; path: string; size: number; mtime_ns: number };
export type DuplicateCluster = { xxhash: string; size: number; count: number; files: DuplicateFile[] };
export type HashAllResult = { hashed: number; skipped: number };
export type ResolveDatesResult = { resolved: number };
export interface MisplacedFile {
  id: number; path: string;
  canonical_date: string; date_source: string;
  folder_year: number; canonical_year: number;
}

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  scan: (root: string) => Promise<ScanResult>;
  hashAll: () => Promise<HashAllResult>;
  duplicatesExact: () => Promise<DuplicateCluster[]>;
  resolveDates: () => Promise<ResolveDatesResult>;
  listMisplaced: () => Promise<MisplacedFile[]>;
  onEvent: (listener: (params: { kind: string; [k: string]: unknown }) => void) => () => void;
}

declare global {
  interface Window {
    curator: CuratorApi;
    __CURATOR_E2E_ROOT__: string | null;
  }
}
