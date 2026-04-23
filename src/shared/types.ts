export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };
export type DuplicateFile = { id: number; path: string; size: number; mtime_ns: number };
export type DuplicateCluster = { xxhash: string; size: number; count: number; files: DuplicateFile[] };
export type HashAllResult = { hashed: number; skipped: number };
export type ResolveDatesResult = { resolved: number };
export type ProposalAction = "quarantine" | "move_to_year";
export type Proposal = {
  action: ProposalAction;
  src_path: string;
  dst_path: string | null;
  reason: string;
};
export type ApplyError = { src: string; error: string };
export type ApplyResult = {
  ok: number;
  failed: number;
  errors?: ApplyError[];
  session_id: string;
};
export interface MisplacedFile {
  id: number;
  path: string;
  canonical_date: string;
  date_source: string;
  folder_year: number;
  canonical_year: number;
}
export interface ZeroByteFile {
  id: number;
  path: string;
}
export interface Session {
  id: string;
  started_at: string;
  completed_at: string | null;
  kind: string;
  action_count: number;
}

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  pickFolder: () => Promise<string | null>;
  scan: (root: string) => Promise<ScanResult>;
  hashAll: (root: string) => Promise<HashAllResult>;
  duplicatesExact: (root: string) => Promise<DuplicateCluster[]>;
  resolveDates: (root: string) => Promise<ResolveDatesResult>;
  listMisplaced: (archiveRoot: string) => Promise<MisplacedFile[]>;
  listZeroByte: (archiveRoot: string) => Promise<ZeroByteFile[]>;
  buildProposals: (archiveRoot: string) => Promise<Proposal[]>;
  applyProposals: (archiveRoot: string, proposals: Proposal[]) => Promise<ApplyResult>;
  listSessions: () => Promise<Session[]>;
  undoSession: (id: string) => Promise<{ restored: number; failed: number; errors?: ApplyError[]; session_id: string }>;
  onEvent: (listener: (params: { kind: string; [k: string]: unknown }) => void) => () => void;
}

declare global {
  interface Window {
    curator: CuratorApi;
    __CURATOR_E2E_ROOT__: string | null;
  }
}
