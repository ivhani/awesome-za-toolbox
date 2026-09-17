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
