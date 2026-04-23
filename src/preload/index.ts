import { contextBridge, ipcRenderer } from "electron";
import type { CuratorApi } from "@shared/types";

const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
  getSidecarVersion: () => ipcRenderer.invoke("curator:getSidecarVersion"),
  ping: () => ipcRenderer.invoke("curator:ping"),
  minimizeWindow: () => ipcRenderer.invoke("curator:minimizeWindow"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("curator:toggleMaximizeWindow"),
  closeWindow: () => ipcRenderer.invoke("curator:closeWindow"),
  pickFolder: () => ipcRenderer.invoke("curator:pickFolder"),
  scan: (root: string) => ipcRenderer.invoke("curator:scan", root),
  hashAll: () => ipcRenderer.invoke("curator:hashAll"),
  duplicatesExact: () => ipcRenderer.invoke("curator:duplicatesExact"),
  resolveDates: () => ipcRenderer.invoke("curator:resolveDates"),
  listMisplaced: () => ipcRenderer.invoke("curator:listMisplaced"),
  listZeroByte: () => ipcRenderer.invoke("curator:listZeroByte"),
  buildProposals: (archiveRoot: string) => ipcRenderer.invoke("curator:buildProposals", archiveRoot),
  applyProposals: (archiveRoot, proposals) => ipcRenderer.invoke("curator:applyProposals", archiveRoot, proposals),
  listSessions: () => ipcRenderer.invoke("curator:listSessions"),
  undoSession: (id: string) => ipcRenderer.invoke("curator:undoSession", id),
  onEvent: (listener) => {
    const wrapped = (_: unknown, params: { kind: string; [k: string]: unknown }) => listener(params);
    ipcRenderer.on("curator:event", wrapped);
    return () => {
      ipcRenderer.removeListener("curator:event", wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("curator", api);
contextBridge.exposeInMainWorld("__CURATOR_E2E_ROOT__", process.env.CURATOR_E2E_ROOT ?? null);
