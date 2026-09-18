# Desktop Application Spec

## Objective

Ship the first open-source Awesome ZA Toolbox desktop application: a Windows-first Electron app with a reusable React/Vite interface for processing a folder of supported South African documents entirely on the user's machine.

## Approved Behavior

- The first screen offers a single primary action to choose a folder and explains that processing stays local.
- Cancelling the system folder picker leaves the current session unchanged and is not treated as an error.
- The application scans the selected folder (non-recursively), discovers regular files, and creates one stable result row per discovered file.
- Supported PDF files are processed independently. One failure never prevents later files from being processed.
- Non-PDF files are retained in the table with an `unsupported` status.
- Each supported file ends as `success`, `review`, or `failed`:
  - `success` means a parser returned data with high confidence and no warnings or failed checks.
  - `review` means usable normalized data exists but warnings, non-high confidence, or failed checks require attention.
  - `failed` means no supported parser produced normalized data.
- Progress reports the current file, completed count, total count, and status totals.
- Results can be filtered by status and inspected without displaying raw source text or full source paths.
- Detail views show normalized fields, checks, warnings, and coded errors. Account identifiers remain masked where the parser provides masked values.
- A result set can be exported as generic JSON or CSV through a save dialog. Export contains normalized results and diagnostics, not raw source document text or absolute paths.
- Empty folders, recoverable scan errors, and export errors have explicit states and retry paths.

## Application Contract

The React UI depends only on a transport-neutral `DesktopApplication` contract:

- `chooseFolder(): Promise<FolderSelection>`
- `processFolder(request, onProgress): Promise<FolderProcessResult>`
- `exportResults(request): Promise<ExportResult>`

The Electron preload adapter implements this contract with typed IPC. A hosted Node service may later implement the same logical operations without changing feature components.

## Security and Privacy Boundaries

- `contextIsolation` is enabled.
- Renderer Node integration and sandbox escape APIs are disabled.
- The preload exposes only the three application operations and progress subscription required by the contract.
- IPC handlers validate all untrusted inputs and never execute commands.
- Folder processing accepts only a short-lived opaque selection token created by the main process, not a renderer-supplied filesystem path.
- Export writes only to a main-process path returned by the native save dialog.
- No telemetry, accounts, authentication, network requests, uploads, remote AI, or raw document logging.
- The production renderer uses a restrictive Content Security Policy and does not render untrusted HTML.

## Scope

- Windows-first Electron packaging.
- React and Vite renderer.
- Local FNB and eJoburg parsing via current workspace packages.
- Non-recursive folder discovery.
- JSON and CSV export.
- Synthetic fixtures and focused domain, contract, IPC, and UI tests.

## Non-Goals

- Cloud or hosted service implementation.
- Recursive scanning, file watching, drag-and-drop, or manual parser selection.
- Excel/workbook output, tax categories, or private COJ POC code.
- Changes to FNB strategy internals or imports from unmerged branches.
- OCR, portal login, scraping, credentials, telemetry, or automatic updates.
- Signing, publishing, or releasing installers.

## Acceptance Criteria

- Work is isolated in a clean worktree and feature branch based on latest `origin/main`.
- The renderer imports no Electron or Node filesystem modules.
- Mixed folders remain stable while per-file statuses move through processing to terminal states.
- Parser dispatch uses the existing public FNB and eJoburg entry points and continues after ordinary failures.
- JSON and CSV exports use a narrow provider interface with no spreadsheet dependency.
- Unit/integration tests cover mixed outcomes, parser dispatch, status classification, export serialization, input validation, folder cancellation, empty folders, progress, and representative UI states.
- Electron starts successfully against the production renderer bundle, with security preferences verified by tests and a smoke run.
- Root typecheck, tests, build, production dependency audit, and diff checks pass.
- No private documents, raw extracted text, absolute private paths, or financial data are committed.
- Changes are committed, pushed, and opened as one focused pull request to `main`; the pull request is not merged.
