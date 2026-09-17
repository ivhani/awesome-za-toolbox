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

Pending implementation verification.
