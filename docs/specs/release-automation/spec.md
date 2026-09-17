# Automated Release Spec

## Objective

Automate versioning, changelog generation, GitHub releases, tags, verification, and npm publication for the public `za-toolbox` package without requiring feature branches to edit version files.

## Behavior

- Pushes to `main` run Release Please.
- Conventional Commit messages determine semantic version intent.
- Pull requests must pass a Conventional Commit title check.
- Release Please maintains a separate release pull request for `apps/cli`.
- Merging the release pull request updates the package version and changelog, creates a `za-toolbox-vX.Y.Z` tag and GitHub release, and publishes the exact released commit to npm.
- npm publication uses the existing trusted-publishing identity bound to `release-za-toolbox.yml`.
- The publish job runs only when Release Please reports that the `apps/cli` release was created.

## Boundaries

- Only `apps/cli` is public and versioned by this workflow.
- Feature branches do not edit versions or create tags.
- Publication requires merging the dedicated release pull request; ordinary feature merges do not publish directly.
- No npm token, personal access token, or other long-lived secret is added.
- The workflow filename remains unchanged.

## Acceptance Criteria

- Release Please is bootstrapped from the published `0.1.0` version and current remote mainline history.
- Tags retain the `za-toolbox-vX.Y.Z` format.
- Release and publish jobs use separate least-privilege permissions.
- Publication checks out the exact commit associated with the created release.
- Existing typecheck, test, build, and production dependency audit pass.
- Release configuration and workflow syntax are validated locally.
- Pull-request title validation accepts supported release and non-release types and rejects non-conventional titles.
- Repository settings required for automated release pull requests are recorded and verified.
