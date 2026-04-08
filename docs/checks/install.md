# checks().install

Back to the [Checks index](./README.md) or the [docs index](../README.md).

## What it does

`checks().install(...)` prepares a reusable Node workspace inside a Dagger container.

It can:

- copy the repository manifests needed for installation
- use npm authentication for private packages when needed
- install dependencies with `npm ci`
- enable Playwright setup when requested
- enable Firebase CLI tooling when requested

## Why it exists

Many CI steps need the same base setup before they can do useful work. This function creates that setup once so later steps can run in a prepared environment.

## Main inputs

Common inputs include:

- `source` — the repository to prepare
- `nodeAuthToken` — optional token for private package access
- `packagePaths` — one path or many package paths
- `playwrightInstall` — whether to install Playwright browsers and system packages
- `firebaseTools` — whether to install Firebase tooling

## What happens internally

At a high level, the install flow:

1. creates a base Node container
2. mounts npm cache and Playwright cache support
3. copies lockfiles and package manifests first
4. adds npm auth only when a token is available
5. runs `npm ci`
6. optionally adds Firebase tooling
7. optionally installs Playwright browsers and system dependencies
8. overlays full source into the prepared workspace

## How this repo uses the idea

Inside this repository, the install behavior is defined in `/home/runner/work/daggerverse/daggerverse/src/copilot/prepare-node-workspace.ts` and reused by the checks and Playwright flows.

## How other repos can reuse it

Use this when another repository needs a prepared workspace before running tests, builds, or deployment logic.

Typical fit:

- monorepos with multiple package paths
- repos with private `@staytunedllp/*` packages
- repos that need Playwright in CI
- repos that need Firebase tooling for later steps

## Best-fit scenarios

- prepare a workspace once and reuse it in several steps
- warm up a CI job before E2E tests
- install dependencies for one package or a small list of packages

## Common mistakes or limits

- If a private package is required but no token is passed, npm install can fail.
- If a package path has no lockfile, install behavior will not be reliable.
- This function prepares the workspace; it does not itself run format, lint, build, or test commands.

## Related docs

- [Format, lint, build, and test checks](./format-lint-build-test.md)
- [testPlaywright](../playwright/test-playwright.md)
- [Shared workspace helpers](../shared/workspace-helpers.md)
