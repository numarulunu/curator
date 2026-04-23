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
  hashAll: (root: string) => ipcRenderer.invoke("curator:hashAll", root),
  duplicatesExact: (root: string) => ipcRenderer.invoke("curator:duplicatesExact", root),
  resolveDates: (root: string) => ipcRenderer.invoke("curator:resolveDates", root),
  listMisplaced: (archiveRoot: string) => ipcRenderer.invoke("curator:listMisplaced", archiveRoot),
  listZeroByte: (archiveRoot: string) => ipcRenderer.invoke("curator:listZeroByte", archiveRoot),
  buildProposals: (archiveRoot: string) => ipcRenderer.invoke("curator:buildProposals", archiveRoot),
  applyProposals: (archiveRoot, proposals, outputRoot) => ipcRenderer.invoke("curator:applyProposals", archiveRoot, proposals, outputRoot),
  listSessions: () => ipcRenderer.invoke("curator:listSessions"),
  undoSession: (id: string) => ipcRenderer.invoke("curator:undoSession", id),
  retrySession: (sessionId: string) => ipcRenderer.invoke("curator:retrySession", sessionId),
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
