import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: path.join(currentDirectory, "src/electron/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: path.join(currentDirectory, "src/electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: path.join(currentDirectory, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: path.join(currentDirectory, "src/renderer/index.html"),
      },
    },
  },
});
