import { contextBridge, ipcRenderer } from "electron";
import type { CuratorApi } from "@shared/types";

const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
  getSidecarVersion: () => ipcRenderer.invoke("curator:getSidecarVersion"),
  ping: () => ipcRenderer.invoke("curator:ping"),
};
contextBridge.exposeInMainWorld("curator", api);
