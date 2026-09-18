# Desktop Application Analysis

## Existing State

- The repository is a small pnpm/TypeScript monorepo with no existing web or desktop frontend.
- `apps/cli` is intentionally thin and imports public functions from `@awesome-za/fnb` and `@awesome-za/ejoburg`.
- Both parsers accept `{ filePath }` and return the common `ParseResult<T>` envelope with normalized data, warnings, errors, confidence, and checks.
- Schemas distinguish normalized `BankStatement` and `MunicipalStatement` data.
- Current main has no generic document detector or batch contract. FNB and eJoburg remain institution-specific entry points.
- The eJoburg parser may include strategy diagnostics in metadata; the shared `ParseMetadata` contract intentionally permits package-specific serializable extensions at runtime.
- No frontend component system or icon library exists, so the desktop app may introduce a small icon dependency.

## Decisions

- Keep generic orchestration inside `apps/desktop`; do not alter parser internals or manufacture a new shared public parser contract in this feature.
- Try supported parsers independently for each PDF because filenames are not a reliable document classifier. Select a sole success. When both succeed, compare normalized document kinds and require review instead of silently preferring one.
- Discover only the selected directory's immediate regular files for a predictable first release.
- Represent selection with an opaque token held by the Electron main process. This prevents renderer-controlled arbitrary path access while retaining a transport-neutral request shape.
- Send progress as serializable snapshots over a dedicated event channel keyed by request ID.
- Sanitize parser errors before the renderer boundary: retain error codes and generic messages but remove absolute folder paths.
- Export a row-oriented generic CSV with document/file metadata plus normalized record fields. JSON preserves the normalized typed structure and diagnostics.
- Use Lucide React because the repository has no icon library and the package is small, established, tree-shakeable, and accessible when paired with labels.
- Avoid remote fonts and all network runtime dependencies.

## Integration Point

If a future mainline introduces a generic parser registry, replace only the app-local parser dispatcher in `src/application/parser-dispatch.ts`. The transport contract, React features, IPC surface, and exporters remain unchanged.

## Risks and Mitigations

- A PDF could accidentally satisfy more than one parser. Treat dual success as review-required and retain both diagnostics rather than silently choosing.
- Parser error text can contain source paths. Sanitize paths before creating renderer-facing results and avoid logging document contents.
- Large folders can make renderer payloads expensive. Emit one compact snapshot per completed file in v1 and process sequentially to bound memory/CPU pressure.
- Electron broadens dependency and attack surface. Pin through the lockfile, use Electron fuses/security preferences where supported, validate IPC input, apply CSP, and run production audits.
- Installer creation can be environment-sensitive. Separate deterministic compile/build verification from the Windows packaging command and document unsigned output.
