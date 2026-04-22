import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { AppVersion, ScanResult, SidecarVersion } from "@shared/types";
import { Sidecar } from "./sidecar";
import { resolveCuratorStateDir } from "./paths";
import { openDb, runMigrations } from "./db";

let sidecar: Sidecar | null = null;
let db: Database.Database | null = null;

function resolveSidecar(): Sidecar {
  if (app.isPackaged) {
    const exe = join(process.resourcesPath, "sidecar", "curator-sidecar.exe");
    return new Sidecar({ python: exe, cwd: join(process.resourcesPath, "sidecar"), args: [] });
  }
  // In dev + e2e, __dirname is `<repo>/out/main/`. Navigate up twice to reach the repo root.
  const repoRoot = join(__dirname, "..", "..");
  return new Sidecar({
    python: join(repoRoot, "python", ".venv", "Scripts", "python.exe"),
    cwd: join(repoRoot, "python"),
    args: ["-m", "curator"],
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600, backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged && !process.env.CURATOR_E2E) win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("curator:getVersion", (): AppVersion => ({
  node: process.versions.node, electron: process.versions.electron,
}));
ipcMain.handle("curator:getSidecarVersion", async (): Promise<SidecarVersion> => {
  return await sidecar!.call<SidecarVersion>("version", {});
});
ipcMain.handle("curator:ping", async (): Promise<boolean> => {
  const r = await sidecar!.call<{ pong: boolean }>("ping", {});
  return r.pong;
});
ipcMain.handle("curator:pickFolder", async (): Promise<string | null> => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});
ipcMain.handle("curator:scan", async (_event, root: string): Promise<ScanResult> => {
  return await sidecar!.call<ScanResult>("scan", { root });
});

app.whenReady().then(async () => {
  const stateDir = resolveCuratorStateDir();
  const dbPath = join(stateDir, "index.db");
  db = openDb(dbPath);
  runMigrations(db);
  sidecar = resolveSidecar();
  const binDir = app.isPackaged
    ? join(process.resourcesPath, "bin")
    : join(__dirname, "..", "..", "resources", "bin");
  await sidecar.start({ DB_PATH: dbPath, CURATOR_BIN_DIR: binDir });
  createWindow();
});

app.on("window-all-closed", async () => {
  if (sidecar) { await sidecar.close(); sidecar = null; }
  if (db) { db.close(); db = null; }
  if (process.platform !== "darwin") app.quit();
});
