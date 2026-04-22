export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };
export type ScanResult = { scanned: number; root: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  pickFolder: () => Promise<string | null>;
  scan: (root: string) => Promise<ScanResult>;
  onEvent: (listener: (params: { kind: string; [k: string]: unknown }) => void) => () => void;
}

declare global {
  interface Window {
    curator: CuratorApi;
    __CURATOR_E2E_ROOT__: string | null;
  }
}
