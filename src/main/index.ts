import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  AppVersion,
  ApplyResult,
  DuplicateCluster,
  HashAllResult,
  MisplacedFile,
  Proposal,
  ScanResult,
  SidecarVersion,
  ZeroByteFile,
} from "@shared/types";
import { applyProposals, retrySession } from "./apply";
import { runAnalysis } from "./analysis";
import { applyCluster, listClusters, setClusterWinner } from "./clusters";
import { undoSession } from "./undo";
import { openDb, runMigrations } from "./db";
import { detectHardware } from "./hardware";
import { reconcileInterruptedSessions } from "./reconcile";
import { resolveCuratorStateDir } from "./paths";
import { buildProposals } from "./proposals";
import {
  listMisplacedByDate,
  listSessions,
  listZeroByte,
  type SessionRow,
} from "./queries";
import { getAnalysisSettings, saveAnalysisSettings } from "./settings";
import { Sidecar } from "./sidecar";
import { createUpdaterLogger, startAutoUpdater } from "./updater";

let sidecar: Sidecar | null = null;
let db: Database.Database | null = null;
let mainWindow: BrowserWindow | null = null;
let backendReady: Promise<void> | null = null;
let backendError: Error | null = null;

function writeStartupLog(stateDir: string, message: string): void {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(join(stateDir, "_startup.log"), `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

async function ensureBackendReady(): Promise<void> {
  if (backendError) throw backendError;
  if (backendReady) await backendReady;
  if (backendError) throw backendError;
  if (!db || !sidecar) throw new Error("Curator backend is not available.");
}

async function initializeBackend(stateDir: string): Promise<void> {
  writeStartupLog(stateDir, "backend init start");
  const dbPath = join(stateDir, "index.db");
  writeStartupLog(stateDir, `state dir: ${stateDir}`);
  writeStartupLog(stateDir, `db path: ${dbPath}`);
  db = openDb(dbPath);
  runMigrations(db);
  writeStartupLog(stateDir, "database ready");
  const reconcileSummary = reconcileInterruptedSessions(db, stateDir);
  writeStartupLog(
    stateDir,
    `reconcile: total=${reconcileSummary.total} autoHealed=${reconcileSummary.autoHealed} interrupted=${reconcileSummary.interrupted} neverStarted=${reconcileSummary.neverStarted}`,
  );
  sidecar = resolveSidecar();
  const binDir = app.isPackaged ? join(process.resourcesPath, "bin") : join(__dirname, "..", "..", "resources", "bin");
  await sidecar.start({ DB_PATH: dbPath, CURATOR_BIN_DIR: binDir });
  writeStartupLog(stateDir, "sidecar ready");
  sidecar.on("event", (params) => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send("curator:event", params);
  });
  void startAutoUpdater(autoUpdater, {
    isPackaged: app.isPackaged,
    platform: process.platform,
    isE2E: Boolean(process.env.CURATOR_E2E),
    disabled: process.env.CURATOR_DISABLE_AUTO_UPDATE === "1",
    logger: createUpdaterLogger(join(stateDir, "_updater.log")),
  });
  writeStartupLog(stateDir, "backend init complete");
}

function resolveSidecar(): Sidecar {
  if (app.isPackaged) {
    const exe = join(process.resourcesPath, "sidecar", "curator-sidecar.exe");
    return new Sidecar({ python: exe, cwd: join(process.resourcesPath, "sidecar"), args: [] });
  }

  const repoRoot = join(__dirname, "..", "..");
  return new Sidecar({
    python: join(repoRoot, "python", ".venv", "Scripts", "python.exe"),
    cwd: join(repoRoot, "python"),
    args: ["-m", "curator"],
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged && !process.env.CURATOR_E2E) win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("curator:getVersion", (): AppVersion => ({
  version: app.getVersion(),
  node: process.versions.node,
  electron: process.versions.electron,
}));
ipcMain.handle("curator:getSidecarVersion", async (): Promise<SidecarVersion> => {
  await ensureBackendReady();
  return await sidecar!.call<SidecarVersion>("version", {});
});
ipcMain.handle("curator:ping", async (): Promise<boolean> => {
  await ensureBackendReady();
  const result = await sidecar!.call<{ pong: boolean }>("ping", {});
  return result.pong;
});
ipcMain.handle("curator:minimizeWindow", async (): Promise<void> => {
  mainWindow?.minimize();
});
ipcMain.handle("curator:toggleMaximizeWindow", async (): Promise<void> => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("curator:closeWindow", async (): Promise<void> => {
  mainWindow?.close();
});
ipcMain.handle("curator:pickFolder", async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle("curator:scan", async (_event, root: string): Promise<ScanResult> => {
  await ensureBackendReady();
  const stateDir = resolveCuratorStateDir();
  writeStartupLog(stateDir, `scan requested: ${root}`);
  const result = await sidecar!.call<ScanResult>("scan", { root });
  writeStartupLog(stateDir, `scan result: root=${result.root} scanned=${result.scanned}`);
  return result;
});
ipcMain.handle("curator:hashAll", async (_event, root: string): Promise<HashAllResult> => {
  await ensureBackendReady();
  return await sidecar!.call<HashAllResult>("hashAll", { root });
});
ipcMain.handle("curator:duplicatesExact", async (_event, root: string): Promise<DuplicateCluster[]> => {
  await ensureBackendReady();
  return await sidecar!.call<DuplicateCluster[]>("duplicatesExact", { root });
});
ipcMain.handle("curator:resolveDates", async (_event, root: string) => {
  await ensureBackendReady();
  return sidecar!.call<{ resolved: number }>("resolveDates", { root });
});
ipcMain.handle("curator:listMisplaced", async (_event, archiveRoot: string): Promise<MisplacedFile[]> => {
  await ensureBackendReady();
  return listMisplacedByDate(db!, archiveRoot);
});
ipcMain.handle("curator:listZeroByte", async (_event, archiveRoot: string): Promise<ZeroByteFile[]> => {
  await ensureBackendReady();
  return listZeroByte(db!, archiveRoot);
});
ipcMain.handle("curator:buildProposals", async (_event, archiveRoot: string): Promise<Proposal[]> => {
  await ensureBackendReady();
  return buildProposals(db!, archiveRoot);
});
ipcMain.handle("curator:applyProposals", async (_event, archiveRoot: string, proposals: Proposal[], outputRoot?: string | null): Promise<ApplyResult> => {
  await ensureBackendReady();
  return applyProposals(db!, sidecar!, archiveRoot, proposals, outputRoot);
});
ipcMain.handle("curator:listSessions", async (): Promise<SessionRow[]> => {
  await ensureBackendReady();
  return listSessions(db!);
});
ipcMain.handle("curator:undoSession", async (_event, id: string) => {
  await ensureBackendReady();
  return undoSession(db!, sidecar!, id);
});
ipcMain.handle("curator:retrySession", async (_event, id: string) => {
  await ensureBackendReady();
  return retrySession(db!, sidecar!, id);
});
ipcMain.handle("curator:getAnalysisSettings", async () => {
  await ensureBackendReady();
  return getAnalysisSettings(sidecar!);
});
ipcMain.handle("curator:saveAnalysisSettings", async (_evt, settings) => {
  await ensureBackendReady();
  return saveAnalysisSettings(sidecar!, settings);
});
ipcMain.handle("curator:detectHardware", async () => {
  await ensureBackendReady();
  return detectHardware(sidecar!);
});
ipcMain.handle("curator:cancelAnalysis", async () => {
  await ensureBackendReady();
  await sidecar!.call("cancelAnalysis", {});
});

const APP_PREFS_PATH = join(resolveCuratorStateDir(), "app_prefs.json");

ipcMain.handle("curator:getAppPrefs", async () => {
  if (!existsSync(APP_PREFS_PATH)) return { archiveRoot: null, outputRoot: null };
  try {
    const raw = readFileSync(APP_PREFS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      archiveRoot: typeof parsed.archiveRoot === "string" ? parsed.archiveRoot : null,
      outputRoot: typeof parsed.outputRoot === "string" ? parsed.outputRoot : null,
    };
  } catch {
    return { archiveRoot: null, outputRoot: null };
  }
});

ipcMain.handle("curator:saveAppPrefs", async (_evt, prefs: { archiveRoot: string | null; outputRoot: string | null }) => {
  writeFileSync(APP_PREFS_PATH, JSON.stringify(prefs, null, 2), "utf-8");
});
ipcMain.handle("curator:runAnalysis", async (_evt, archiveRoot: string, settings: import("@shared/types").AnalysisSettings) => {
  await ensureBackendReady();
  return runAnalysis(sidecar!, archiveRoot, settings, {
    onProgress: (p) => mainWindow?.webContents.send("curator:event", { kind: "analysis-progress", ...p }),
  });
});
ipcMain.handle("curator:listClusters", async (_event, root: string | null) => {
  await ensureBackendReady();
  return listClusters(sidecar!, root);
});
ipcMain.handle("curator:setClusterWinner", async (_event, clusterId: number, fileId: number) => {
  await ensureBackendReady();
  return setClusterWinner(sidecar!, clusterId, fileId);
});
ipcMain.handle("curator:applyCluster", async (_event, clusterId: number, archiveRoot: string) => {
  await ensureBackendReady();
  return applyCluster(sidecar!, clusterId, archiveRoot);
});

app.whenReady().then(async () => {
  const stateDir = resolveCuratorStateDir();
  createWindow();
  backendReady = initializeBackend(stateDir).catch((error) => {
    backendError = error instanceof Error ? error : new Error(String(error));
    writeStartupLog(stateDir, `backend init failed: ${backendError.message}`);
    dialog.showErrorBox("Curator startup failed", backendError.message);
    throw backendError;
  });
});

app.on("window-all-closed", async () => {
  if (sidecar) {
    await sidecar.close();
    sidecar = null;
  }
  if (db) {
    db.close();
    db = null;
  }
  if (process.platform !== "darwin") app.quit();
});
