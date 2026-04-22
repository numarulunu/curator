import { contextBridge, ipcRenderer } from "electron";
import type { CuratorApi } from "@shared/types";

const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
  getSidecarVersion: () => ipcRenderer.invoke("curator:getSidecarVersion"),
  ping: () => ipcRenderer.invoke("curator:ping"),
  pickFolder: () => ipcRenderer.invoke("curator:pickFolder"),
  scan: (root: string) => ipcRenderer.invoke("curator:scan", root),
};
contextBridge.exposeInMainWorld("curator", api);
