export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  scan: (root: string) => Promise<ScanResult>;
}

declare global {
  interface Window { curator: CuratorApi }
}
