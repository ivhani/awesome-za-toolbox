# Awesome ZA Toolbox Desktop

The desktop app processes supported South African documents locally in a folder-first Windows interface. It is built with React, Vite, and Electron and reuses the same parser packages as the `za-toolbox` CLI.

## Privacy model

- Files are opened only after the user chooses a folder with the native Windows picker.
- The renderer receives an opaque selection token, filenames, normalized results, and safe diagnostics. It does not receive the selected folder's absolute path or raw extracted text.
- Parsing and export run in the Electron main process.
- There are no uploads, network APIs, accounts, authentication, telemetry, or remote AI features.

## Supported workflow

1. Choose one folder.
2. Process its immediate files as a stable batch.
3. Review ready, uncertain, unsupported, and failed results.
4. Inspect normalized records and parser diagnostics.
5. Export generic JSON or CSV.

The first release supports PDF parsing through the current FNB and eJoburg packages. Folder scanning is intentionally non-recursive.

## Development

From the repository root, install and build all workspace packages before starting Electron:

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm --filter @awesome-za/desktop dev
```

Run the desktop checks directly:

```bash
corepack pnpm --filter @awesome-za/desktop typecheck
corepack pnpm --filter @awesome-za/desktop test
corepack pnpm --filter @awesome-za/desktop build
corepack pnpm --filter @awesome-za/desktop smoke
```

Build an unsigned Windows application directory:

```bash
corepack pnpm --filter @awesome-za/desktop package:win
```

The output is written under the ignored `apps/desktop/release/` directory. This repository does not publish, sign, or auto-update the desktop app yet.

## Architecture

- `src/shared` — serializable UI/application contract and runtime validation.
- `src/application` — parser dispatch, folder processing, result classification, and export providers.
- `src/electron` — secure BrowserWindow, native dialogs, IPC handlers, and preload adapter.
- `src/renderer` — filesystem-independent React workspace.

See `docs/adr/0001-desktop-application-boundary.md` and `docs/specs/desktop-app/` for the approved design and verification record.
