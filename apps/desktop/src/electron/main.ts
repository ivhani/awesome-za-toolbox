import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApplicationService } from "../application/application-service.js";
import { registerIpcHandlers } from "./ipc.js";
import { createWindowOptions } from "./window-config.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const smokeTest = process.argv.includes("--smoke-test");
let removeIpcHandlers: (() => void) | undefined;

async function createWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(currentDirectory, "../preload/preload.mjs");
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererPath = path.join(currentDirectory, "../renderer/index.html");
  const productionUrl = pathToFileURL(rendererPath).href;
  const window = new BrowserWindow(createWindowOptions(preloadPath, !smokeTest, Boolean(developmentUrl)));
  removeIpcHandlers = registerIpcHandlers({
    window,
    service: new ApplicationService(),
    developmentUrl,
    productionUrl,
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => {
    if (!smokeTest) window.show();
  });

  if (smokeTest) {
    window.webContents.once("did-finish-load", () => {
      process.stdout.write("desktop-smoke:ready\n");
      setTimeout(() => app.quit(), 100);
    });
  }

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(rendererPath);
  }

  return window;
}

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeTest) app.quit();
});

app.on("before-quit", () => removeIpcHandlers?.());
