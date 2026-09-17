# Automated Release Plan

1. Add a Release Please manifest for the repository release train at version `0.1.0`.
2. Add Release Please configuration with the current remote `main` commit as the bootstrap boundary, the existing component tag format, and synchronized public CLI version updates.
3. Convert `release-za-toolbox.yml` from a tag-only publisher into a mainline release orchestrator.
4. Isolate GitHub release permissions from npm trusted-publishing permissions in separate jobs.
5. Enforce and document Conventional Commit pull-request titles and the release pull-request workflow.
6. Validate configuration, workflow syntax, title handling, repository checks, and security boundaries.
7. Enable the repository setting that allows GitHub Actions to create release pull requests and ensure squash commits use pull-request titles.

## Scope Correction

The initial `apps/cli` component path excluded commits that changed only bundled workspace packages. Track the root component instead, keep `apps/cli/package.json` synchronized as an extra JSON file, and consume root-component outputs in the publish workflow.
