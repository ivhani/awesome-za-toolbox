/// <reference types="vite/client" />

import type { DesktopApplication } from "../../shared/contract.js";

declare global {
  interface Window {
    zaToolbox: DesktopApplication;
  }
}

export {};
