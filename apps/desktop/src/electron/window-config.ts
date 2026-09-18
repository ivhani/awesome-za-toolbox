import type { BrowserWindowConstructorOptions } from "electron";

export function createWindowOptions(preloadPath: string, visible = true, devTools = false): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#f3f0e8",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools,
    },
    ...(visible ? {} : { opacity: 0 }),
  };
}

export function isTrustedRendererUrl(url: string, developmentUrl?: string, productionUrl?: string): boolean {
  if (developmentUrl) {
    try {
      return new URL(url).origin === new URL(developmentUrl).origin;
    } catch {
      return false;
    }
  }
  if (!productionUrl) return false;
  try {
    const actual = new URL(url);
    const expected = new URL(productionUrl);
    actual.hash = "";
    actual.search = "";
    expected.hash = "";
    expected.search = "";
    return actual.href === expected.href;
  } catch {
    return false;
  }
}
