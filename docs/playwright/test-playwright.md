# testPlaywright

Back to the [Playwright index](./README.md) or the [docs index](../README.md).

## What it does

`testPlaywright(...)` prepares a Playwright-ready environment and runs end-to-end tests.

It supports:

- dependency installation
- Playwright system dependency installation
- Playwright browser installation
- optional build execution before tests
- direct test selection
- affected-test discovery based on git changes
- list-only mode for finding selectors without running tests

## Why it exists

Playwright setups often need more than just `npm run test:e2e`. They usually need browsers, OS packages, a prepared workspace, and sometimes a build step. This function brings those steps together in one reusable flow.

## Main inputs

Common inputs include:

- `source`
- `nodeAuthToken`
- `packagePaths`
- `testSelector`
- `testScript`
- `runBuild`
- `registryScope`
- `browsers`
- `runAffected`
- `base`
- `listOnly`
- `changedFiles`

## What happens internally

At a high level, the flow:

1. prepares a Node workspace with dependency installation
2. enables npm and Playwright cache mounts
3. installs Playwright system dependencies
4. installs Playwright browsers
5. overlays full source
6. optionally computes affected selectors from git changes
7. optionally runs a build step first
8. runs the target Playwright npm script

## How this repo uses the idea

The main public method is defined in `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, and the main execution logic is in `/home/runner/work/daggerverse/daggerverse/src/playwright/index.ts`.

The affected-selector logic lives under `/home/runner/work/daggerverse/daggerverse/src/playwright/affected`.

## How other repos can reuse it

This is useful for repositories that want a reusable Playwright CI step without rebuilding container setup from scratch.

A repo can use it for:

- full E2E runs on main or release branches
- selective E2E runs on pull requests
- browser-specific test jobs
- monorepo package-level Playwright execution

## Best-fit scenarios

- faster PR feedback with affected tests
- stable browser installation in CI
- standardizing Playwright setup across multiple repositories

## Common mistakes or limits

- The target repository still needs a working Playwright npm script.
- If `runAffected` is enabled, git history and changed file context must make sense for the selected base ref.
- If private packages are required, an auth token may still be needed.

## Related docs

- [checks().install](../checks/install.md)
- [Shared workspace helpers](../shared/workspace-helpers.md)
- [Use cases](../use-cases.md)
