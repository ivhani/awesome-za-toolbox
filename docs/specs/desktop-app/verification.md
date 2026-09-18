# Desktop Application Verification

## Automated Verification

- `corepack pnpm install --frozen-lockfile` passed with pnpm `10.30.3`; the lockfile and explicit build-script allowlist reproduced cleanly.
- `corepack pnpm typecheck` passed for the existing monorepo and the desktop-specific React/Electron TypeScript project.
- `corepack pnpm test` passed:
  - existing parser and CLI suite: 35 tests passed;
  - desktop Vitest suite: 16 tests passed across parser dispatch, stable folder processing, exports, Electron security, and React states;
  - total: 51 tests passed.
- `corepack pnpm build` passed for all workspace packages, the CLI, Electron main/preload, and the Vite renderer.
- `corepack pnpm audit --prod` reported no known vulnerabilities.
- `git diff --check` passed. The repository emitted only its existing Windows line-ending conversion notices.

## Electron and UI Verification

- `corepack pnpm --filter @awesome-za/desktop smoke` loaded the production renderer in Electron and printed `desktop-smoke:ready`.
- `corepack pnpm --filter @awesome-za/desktop visual-smoke` launched the real production Electron renderer, waited for its reveal animation, and captured `tmp/desktop-visual-smoke.png` through a local Chromium debugging endpoint. The ignored screenshot was inspected for hierarchy, contrast, clipping, spacing, and initial-state completeness.
- The inspected 1280 × 781 render showed the complete initial folder-selection workspace, workflow rail, local-only indicator, mixed-folder preview, privacy statement, and primary action without clipping or unintended scrollbars.
- `corepack pnpm --filter @awesome-za/desktop package:win` produced the unsigned Windows `win-unpacked` application directory.
- The packaged `Awesome ZA Toolbox.exe --smoke-test` process exited with code `0`.
- The packaged ASAR contains the built FNB, eJoburg, core, schema, PDF utility, and `pdfjs-dist` runtime modules. The MIT license is present at `resources/LICENSE.txt`.
- UI tests cover folder-picker cancellation, completed mixed results, status filters, file detail, export feedback, empty folders, and recoverable errors. Folder processor tests cover stable row identity, progress snapshots, unsupported files, failure continuation, and empty discovery.

## Security and Privacy Review

- BrowserWindow uses context isolation, renderer sandboxing, web security, disabled Node integration, disabled production DevTools, and no insecure content.
- The renderer Content Security Policy allows only local scripts, styles, images, fonts, and connections; objects, base changes, framing, and form actions are denied.
- The preload exposes only folder choice, folder processing, progress subscription, and result export.
- Main-process IPC validates strict opaque identifiers and export enums with Zod. Extra path fields and unsupported formats are rejected in tests.
- The main process compares IPC sender URLs with the exact production renderer file or the configured development origin. Window creation and navigation are denied.
- Renderer requests never contain an input or output path. Folder paths are held behind in-memory selection tokens; output paths come only from the native save dialog.
- Parser diagnostics are stripped of the selected absolute directory and other Windows absolute paths before crossing into the renderer.
- No document contents are logged. Exports contain normalized data and coded diagnostics, not raw extracted text or absolute paths.
- Repository and diff scans found no real statement, private path, private financial data, credential, or local output added to Git.
- Production dependency audit found no known vulnerabilities.

## Remaining Limitations

- The Windows directory build is intentionally unsigned and uses Electron's default application icon. Signing, branded installer assets, publishing, and automatic updates remain release work.
- Folder scanning is intentionally non-recursive and PDF is the only supported input extension.
- Ambiguous PDFs recognized by both document families are held for review without a normalized selection; a future generic parser registry should replace the app-local dispatcher.
- The native computer-use inventory was unavailable during verification, so visual inspection used the committed project-local Chromium capture harness rather than UI automation. The real Electron renderer was still launched and captured.
- Electron Builder reports unbundled optional `@napi-rs/canvas` binaries for platforms other than the packaged Windows x64 target. The text/XFA/layout parsing paths do not require canvas, and the packaged application smoke passed.

## Delivery

- Feature branch: `feat/desktop-app`, based directly on refreshed `origin/main` in its own worktree.
- Pull request: [#13 — feat: add local-first desktop application](https://github.com/ivhani/awesome-za-toolbox/pull/13).
- The pull request is open and attached to the originating Codex task. It has not been merged or released.
