export type AppVersion = { version: string; node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };
type DuplicateFile = { id: number; path: string; size: number; mtime_ns: number };
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
  skipped?: boolean;
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
  pending_count: number;
}

export interface ScoreBreakdown {
  sharpness: number;
  resolution: number;
  face_quality: number;
  nima_score: number;
  exposure: number;
  bytes_per_pixel: number;
}

export interface ClusterMember {
  file_id: number;
  path: string;
  size: number;
  score: number;
  breakdown: ScoreBreakdown;
  width: number | null;
  height: number | null;
}

export interface Cluster {
  id: number;
  method: "phash" | "clip";
  confidence: number;
  applied_session_id: string | null;
  winner: ClusterMember | null;
  losers: ClusterMember[];
}

export interface ClusterListing {
  clusters: Cluster[];
}

export interface SmartDistillResult {
  clusters_created: number;
  files_clustered: number;
  clusters_graded: number;
  features_processed: number;
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
  applyProposals: (archiveRoot: string, proposals: Proposal[], outputRoot?: string | null) => Promise<ApplyResult>;
  listSessions: () => Promise<Session[]>;
  undoSession: (id: string) => Promise<{ restored: number; failed: number; errors?: ApplyError[]; session_id: string }>;
  retrySession: (sessionId: string) => Promise<ApplyResult>;
  smartDistill: (root: string) => Promise<SmartDistillResult>;
  listClusters: (root: string | null) => Promise<ClusterListing>;
  setClusterWinner: (clusterId: number, fileId: number) => Promise<void>;
  applyCluster: (clusterId: number, archiveRoot: string) => Promise<ApplyResult>;
  onEvent: (listener: (params: { kind: string; [k: string]: unknown }) => void) => () => void;
  getAnalysisSettings: () => Promise<AnalysisSettings>;
  saveAnalysisSettings: (settings: AnalysisSettings) => Promise<void>;
  detectHardware: () => Promise<HardwareProfile>;
  runAnalysis: (archiveRoot: string) => Promise<AnalysisResult>;
  cancelAnalysis: () => Promise<void>;
}

export type AiMode = "off" | "lite" | "full";
export type PresetName = "safe" | "balanced" | "aggressive" | "custom";
export type ProfileName = "eco" | "balanced" | "max" | "custom";

export interface AnalysisSettings {
  similar_photo_review: boolean;
  ai_mode: AiMode;
  preset: PresetName;
  preset_custom: Record<string, number>;
  profile: ProfileName;
  profile_custom: Record<string, number | string>;
}

export interface HardwareProfile {
  cpu_count: number;
  memory_mb: number;
  providers: string[];
  directml_available: boolean;
}

export type AnalysisPhase =
  | "scan" | "hash" | "dates"
  | "features" | "cluster" | "grade" | "done";

export interface AnalysisProgress {
  phase: AnalysisPhase;
  processed?: number;
  total?: number;
  note?: string;
}

export interface AnalysisResult {
  scanned: number;
  hashed: number;
  clusters_created: number;
  features_processed: number;
  cancelled: boolean;
}

declare global {
  interface Window {
    curator: CuratorApi;
    __CURATOR_E2E_ROOT__: string | null;
  }
}
