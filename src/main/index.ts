import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { AppVersion } from "@shared/types";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (!app.isPackaged && !process.env.CURATOR_E2E) win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("curator:getVersion", (): AppVersion => ({
  node: process.versions.node,
  electron: process.versions.electron,
}));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
