export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
}

declare global {
  interface Window { curator: CuratorApi }
}
