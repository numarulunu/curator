import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  AppVersion,
  ApplyResult,
  DuplicateCluster,
  HashAllResult,
  Proposal,
  ScanResult,
  SidecarVersion,
} from "@shared/types";
import { openDb, runMigrations } from "./db";
import { resolveCuratorStateDir } from "./paths";
import { buildProposals } from "./proposals";
import {
  listMisplacedByDate,
  listSessions,
  listZeroByte,
  type MisplacedFile,
  type SessionRow,
  type ZeroByteFile,
} from "./queries";
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
  db = openDb(dbPath);
  runMigrations(db);
  writeStartupLog(stateDir, "database ready");
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
  return await sidecar!.call<ScanResult>("scan", { root });
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
  const sessionId = randomUUID();
  db!.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run(sessionId);
  const insertAction = db!.prepare(
    "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')",
  );
  for (const proposal of proposals) {
    insertAction.run(sessionId, proposal.action, proposal.src_path, proposal.dst_path, proposal.reason);
  }

  const result = await sidecar!.call<ApplyResult>("applyActions", {
    actions: proposals,
    archive_root: archiveRoot,
    output_root: outputRoot ?? null,
    session_id: sessionId,
  });

  const failedBySrc = new Map((result.errors ?? []).map((error) => [error.src, error.error]));
  const updateAction = db!.prepare(
    "UPDATE actions SET status = ?, error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  for (const proposal of proposals) {
    const error = failedBySrc.get(proposal.src_path) ?? null;
    updateAction.run(error ? "failed" : "applied", error, sessionId, proposal.src_path);
  }
  db!.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?").run(sessionId);
  return result;
});
ipcMain.handle("curator:listSessions", async (): Promise<SessionRow[]> => {
  await ensureBackendReady();
  return listSessions(db!);
});
ipcMain.handle("curator:undoSession", async (_event, id: string) => {
  await ensureBackendReady();
  const result = await sidecar!.call<{ restored: number; failed: number; errors?: Array<{ src: string; error: string }>; session_id: string }>(
    "undoSession",
    { session_id: id },
  );
  db!.prepare("UPDATE actions SET status = 'reversed' WHERE session_id = ?").run(id);
  return result;
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
