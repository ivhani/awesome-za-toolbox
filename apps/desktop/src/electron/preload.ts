import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type DesktopApplication,
  type ProcessProgress,
} from "../shared/contract.js";

const desktopApplication: DesktopApplication = {
  chooseFolder: () => ipcRenderer.invoke(IPC_CHANNELS.chooseFolder),
  processFolder(request, onProgress) {
    const listener = (_event: Electron.IpcRendererEvent, progress: ProcessProgress): void => {
      if (progress.requestId === request.requestId) {
        onProgress(progress);
      }
    };
    ipcRenderer.on(IPC_CHANNELS.processProgress, listener);
    return ipcRenderer.invoke(IPC_CHANNELS.processFolder, request)
      .finally(() => ipcRenderer.removeListener(IPC_CHANNELS.processProgress, listener));
  },
  exportResults: (request) => ipcRenderer.invoke(IPC_CHANNELS.exportResults, request),
};

contextBridge.exposeInMainWorld("zaToolbox", desktopApplication);
