import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function resolveCuratorStateDir(base?: string): string {
  const root = base ?? process.env.LOCALAPPDATA ?? process.env.HOME ?? "";
  const dir = join(root, "Curator");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveBinaryPath(resourcesRoot: string, binName: string): string {
  return join(resourcesRoot, "bin", binName);
}
