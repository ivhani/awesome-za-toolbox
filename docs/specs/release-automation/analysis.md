# Automated Release Analysis

## Existing State

- `apps/cli` is the only public npm package and is currently published as version `0.1.0`.
- npm trusted publishing is already bound to `.github/workflows/release-za-toolbox.yml`.
- The existing workflow publishes only after a manually created `za-toolbox-v*` tag.
- GitHub Actions defaults to read-only permissions, and Actions-created pull requests are currently disabled.
- Squash merges may currently use either a commit title or pull-request title.

## Design Decisions

- Preserve the trusted workflow filename and move Release Please plus npm publication into that workflow.
- Use Release Please manifest mode because the public package lives under `apps/cli`.
- Keep GitHub release mutation and npm OIDC publication in separate jobs with distinct permissions.
- Publish from the release SHA emitted by Release Please rather than an implicit branch checkout.
- Use the built-in `GITHUB_TOKEN`; no long-lived release credential is introduced.

## Verification Evidence

- Release Please `debug-config --dry-run` loaded the remote branch configuration and resolved `apps/cli` as the `za-toolbox` Node component at version `0.1.0` with the configured bootstrap commit.
- Release Please `release-pr --dry-run` considered only commits after the bootstrap boundary and correctly proposed no release for the automation-only `chore:` commit.
- Both GitHub Actions workflow files passed YAML parsing.
- Release Please configuration and manifest files passed JSON parsing.
- Conventional pull-request title cases accepted `feat:`, scoped `fix:`, breaking `feat!:`, and Release Please's `chore(main):` title while rejecting non-conventional examples.
- `pnpm typecheck` passed.
- `pnpm test` passed: 15 tests, 15 passing.
- `pnpm build` passed.
- `pnpm audit --prod` passed with no known vulnerabilities.
- `git diff --check` passed; only local line-ending conversion warnings were reported.

## Security Review

- No npm token, personal access token, or repository secret was added.
- The Release Please job receives only repository contents, issue-label, and pull-request write permissions.
- The publish job receives only repository read and npm OIDC identity permissions.
- The publish job is gated on the path-specific `apps/cli` release output and checks out the release SHA emitted by Release Please.
- GitHub Actions retains read-only default permissions. The repository setting allowing Actions-created pull requests is enabled for the Release Please workflow.
- Squash commits now use pull-request titles so the enforced Conventional Commit title reaches `main` deterministically.

## Post-Merge Scope Finding

The first mainline run after merging the XFA parser completed successfully but proposed no release. Release Please split commits by the configured `apps/cli` path and assigned zero commits to that component because the public CLI bundles code from private workspace packages outside its directory.

The correction changes the release component path to the repository root, where the private root `package.json` acts as release-train metadata. Release Please updates `apps/cli/package.json` through an explicit JSON updater and writes the public changelog under `apps/cli`. The publish job remains scoped to `apps/cli` and retains its existing release-created gate, exact release SHA checkout, and npm OIDC permissions.

## Scope Correction Verification

- Release Please `debug-config --dry-run` resolved the root component as `za-toolbox` at version `0.1.0`, with the public CLI package configured as an extra JSON version file.
- Release Please `release-pr --dry-run` against the remote correction branch proposed `0.2.0`.
- The candidate changelog included the already-merged XFA parser feature and this release-scope fix.
- The candidate update set included the private root version, public CLI version, `apps/cli/CHANGELOG.md`, and release manifest.
- Both GitHub Actions workflows passed YAML parsing, and both Release Please JSON files passed JSON parsing.
- `pnpm typecheck` passed.
- `pnpm test` passed: 20 tests, 20 passing.
- `pnpm build` passed.
- `pnpm audit --prod` passed with no known vulnerabilities.
- No permission, secret, npm publishing directory, or trusted workflow identity changed.
