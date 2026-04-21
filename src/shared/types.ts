export type AppVersion = { node: string; electron: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
}

declare global {
  interface Window { curator: CuratorApi }
}
