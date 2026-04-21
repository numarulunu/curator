import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { AppVersion, SidecarVersion } from "@shared/types";
import { Sidecar } from "./sidecar";

let sidecar: Sidecar | null = null;

function resolveSidecar(): Sidecar {
  if (app.isPackaged) {
    const exe = join(process.resourcesPath, "sidecar", "curator-sidecar.exe");
    return new Sidecar({ python: exe, cwd: join(process.resourcesPath, "sidecar"), args: [] });
  }
  return new Sidecar({
    python: join(app.getAppPath(), "python", ".venv", "Scripts", "python.exe"),
    cwd: join(app.getAppPath(), "python"),
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

app.whenReady().then(async () => {
  sidecar = resolveSidecar();
  await sidecar.start();
  createWindow();
});

app.on("window-all-closed", async () => {
  if (sidecar) { await sidecar.close(); sidecar = null; }
  if (process.platform !== "darwin") app.quit();
});
