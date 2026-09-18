// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportRequestSchema, processFolderRequestSchema } from "../src/shared/validation.js";
import { createWindowOptions, isTrustedRendererUrl } from "../src/electron/window-config.js";

describe("Electron security boundary", () => {
  it("keeps Node out of the isolated renderer sandbox", () => {
    const options = createWindowOptions("C:\\safe\\preload.js");
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    });
  });

  it("accepts opaque request identifiers and rejects arbitrary path fields", () => {
    expect(processFolderRequestSchema.parse({ requestId: "request_1", selectionToken: "token-1" })).toBeDefined();
    expect(() => processFolderRequestSchema.parse({ requestId: "request_1", selectionToken: "token-1", filePath: "C:\\private" })).toThrow();
    expect(() => exportRequestSchema.parse({ sessionId: "session-1", format: "xlsx" })).toThrow();
  });

  it("rejects navigation from unrelated renderer origins", () => {
    expect(isTrustedRendererUrl("http://localhost:5173/page", "http://localhost:5173")).toBe(true);
    expect(isTrustedRendererUrl("https://example.com", "http://localhost:5173")).toBe(false);
    expect(isTrustedRendererUrl("https://example.com")).toBe(false);
    expect(isTrustedRendererUrl("file:///app/out/renderer/index.html", undefined, "file:///app/out/renderer/index.html")).toBe(true);
    expect(isTrustedRendererUrl("file:///other/index.html", undefined, "file:///app/out/renderer/index.html")).toBe(false);
  });
});
