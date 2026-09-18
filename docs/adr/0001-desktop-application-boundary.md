# ADR 0001: Desktop Application Boundary

- Status: Accepted
- Date: 2026-09-18

## Context

Awesome ZA Toolbox needs a Windows-first desktop application while preserving a future path to a hosted Node service. Document parsing handles sensitive local files, and the current monorepo exposes reusable institution-specific parser packages but no generic batch API.

## Decision

Build `apps/desktop` as a layered Electron application:

- React/Vite renders a transport-independent UI against a serializable `DesktopApplication` contract.
- Electron preload provides the local adapter through a narrow typed API.
- Main-process application services own filesystem access, parsing, and export.
- Renderer requests refer to opaque selection tokens rather than arbitrary paths.
- Existing parser packages remain the source of parsing truth; an app-local dispatcher provides the temporary generic seam.
- Export uses a provider interface with JSON and CSV implementations only.

## Consequences

- The React UI can later use an HTTP implementation of the same logical contract.
- Sensitive filesystem and parser operations stay outside the renderer.
- The desktop app adds Electron-specific build and packaging dependencies but does not change CLI or parser behavior.
- The app-local dispatcher must later be replaced if and when a shared parser registry lands.
- Folder selections intentionally expire when the application exits.
