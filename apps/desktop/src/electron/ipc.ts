import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ApplicationService } from "../application/application-service.js";
import { IPC_CHANNELS } from "../shared/contract.js";
import { exportRequestSchema, processFolderRequestSchema } from "../shared/validation.js";
import { isTrustedRendererUrl } from "./window-config.js";

export function registerIpcHandlers(input: {
  window: BrowserWindow;
  service: ApplicationService;
  developmentUrl?: string;
  productionUrl: string;
}): () => void {
  const assertTrusted = (event: IpcMainInvokeEvent): void => {
    if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url, input.developmentUrl, input.productionUrl)) {
      throw new Error("Request rejected from an untrusted renderer.");
    }
  };

  ipcMain.handle(IPC_CHANNELS.chooseFolder, async (event) => {
    assertTrusted(event);
    const selection = await dialog.showOpenDialog(input.window, {
      title: "Choose a folder to process",
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    const directoryPath = selection.filePaths[0];
    if (selection.canceled || !directoryPath) {
      return { status: "cancelled" } as const;
    }

    return {
      status: "selected" as const,
      selectionToken: input.service.registerSelection({
        directoryPath,
        displayName: path.basename(directoryPath),
      }),
      displayName: path.basename(directoryPath),
    };
  });

  ipcMain.handle(IPC_CHANNELS.processFolder, async (event, unknownRequest: unknown) => {
    assertTrusted(event);
    const request = processFolderRequestSchema.parse(unknownRequest);
    return input.service.processFolder(request, (progress) => {
      if (!input.window.isDestroyed()) {
        input.window.webContents.send(IPC_CHANNELS.processProgress, progress);
      }
    });
  });

  ipcMain.handle(IPC_CHANNELS.exportResults, async (event, unknownRequest: unknown) => {
    assertTrusted(event);
    const request = exportRequestSchema.parse(unknownRequest);
    const { result, provider } = input.service.getExport(request.sessionId, request.format);
    const safeFolderName = result.displayName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "documents";
    const saveResult = await dialog.showSaveDialog(input.window, {
      title: `Export ${request.format.toUpperCase()}`,
      buttonLabel: "Export",
      defaultPath: `za-toolbox-${safeFolderName}.${provider.extension}`,
      filters: [{ name: request.format.toUpperCase(), extensions: [provider.extension] }],
      properties: ["showOverwriteConfirmation", "dontAddToRecent"],
    });
    if (saveResult.canceled || !saveResult.filePath) {
      return { status: "cancelled" } as const;
    }

    await writeFile(saveResult.filePath, provider.serialize(result), { encoding: "utf8" });
    return { status: "saved" as const, fileName: path.basename(saveResult.filePath) };
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.chooseFolder);
    ipcMain.removeHandler(IPC_CHANNELS.processFolder);
    ipcMain.removeHandler(IPC_CHANNELS.exportResults);
  };
}
