# Desktop Application Plan

## Architecture

1. Add `apps/desktop` with four explicit layers.
   - `src/shared`: serializable transport-neutral contracts and runtime validators.
   - `src/application`: folder processing, parser dispatch, status classification, and export providers.
   - `src/electron`: BrowserWindow, dialogs, preload bridge, and validated IPC handlers.
   - `src/renderer`: React feature UI that consumes only `DesktopApplication`.
2. Keep discovery and document parsing in the Electron main process. The renderer receives safe display models without absolute paths or raw extracted text.
3. Use an opaque in-memory selection token to bind renderer requests to folders chosen by the native dialog.
4. Dispatch PDF parsing through current public parser packages. Try each supported parser independently, select a sole successful result, treat materially different dual successes as review-required, and return structured failure when none succeeds.
5. Keep export behind `ExportProvider`; implement generic JSON and CSV providers only.
6. Build the renderer with Vite and main/preload entries with tsup. Package the compiled application with Electron Builder without signing or publishing.

## UX Direction

- Purpose: turn a mixed local folder into reviewable normalized records and portable generic data.
- Audience: South African individuals and operators reviewing sensitive statements under moderate time pressure.
- Tone: minimal precision.
- Memorable detail: a persistent vertical processing rail that becomes a compact status ledger as files complete.
- Typography: Fraunces-style system serif fallback for sparse display moments and Aptos/Segoe UI for operational text, with no remote font dependency.
- Color: warm paper field, ink neutrals, moss success, amber review, slate unsupported, and restrained red failure.
- Motion: one staged workspace reveal plus status transitions; reduced-motion preferences disable both.

## Delivery Sequence

1. Record spec, ADR, plan, tasks, analysis, and verification template.
2. Scaffold the desktop workspace, typed contracts, build configuration, and security boundary.
3. Implement folder discovery, stable result identities, parser dispatch, status classification, progress, and exporters.
4. Implement the React workspace and all approved desktop states.
5. Add focused unit/integration/UI/security tests using synthetic data only.
6. Update repository documentation, run complete verification, inspect package contents and security posture, then record evidence.
7. Commit incrementally, push the feature branch, and open one focused pull request.

## Rollback

The feature is additive under `apps/desktop` plus documentation and root workspace/test wiring. Reverting its commits removes the desktop app without changing parser behavior or CLI output.
