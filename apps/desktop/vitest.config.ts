import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const workspacePackage = (name: string): string => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@awesome-za/core": workspacePackage("core"),
      "@awesome-za/schemas": workspacePackage("schemas"),
      "@awesome-za/pdf-utils": workspacePackage("pdf-utils"),
      "@awesome-za/fnb": workspacePackage("fnb"),
      "@awesome-za/ejoburg": workspacePackage("ejoburg"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
