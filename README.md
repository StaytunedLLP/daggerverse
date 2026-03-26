# Staydevops Dagger Module

Shared Dagger module for Staytuned TypeScript repositories.

This repo is published to Daggerverse as the `staydevops-ts` module and exposes reusable checks and helper functions for:

- installing Node workspaces
- preparing Playwright-ready CI containers
- validating package prerequisites
- deploying Firebase Hosting projects

## Module API

Checks:

- `format`: runs `npm run format:check`
- `lint`: runs `npm run lint`
- `build`: runs `npm run build`
- `test`: runs `npm run test`

Functions:

- `prepare-node-workspace`: installs dependencies and can optionally install Playwright browsers and Firebase tooling
- `playwright-test`: installs dependencies, provisions Playwright browsers, optionally runs build, and executes E2E tests
- `verify-chromium-bidi`: validates that `chromium-bidi` is installed in the selected package path
- `deploy-webhosting`: installs, builds, and deploys a Firebase Hosting project
- `deployApphosting`: creates or updates a Firebase App Hosting backend and returns its service URL
- `deleteBackend`: deletes a Firebase App Hosting backend

## Usage

List the module API:

```bash
dagger functions -m github.com/StaytunedLLP/daggerverse
```

Run a check against the current repository:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse format --source=.
```

Warm a workspace with Playwright installed:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse prepare-node-workspace \
  --source=. \
  --playwright-install=true
```

Prepare a repository that uses private `@staytunedllp/*` packages:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse prepare-node-workspace \
  --source=. \
  --node-auth-token=env:NODE_AUTH_TOKEN
```

Run Playwright E2E tests:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse playwright-test \
  --source=. \
  --package-paths=apps/web \
  --test-script=test:e2e
```

Optional selector/path forwarding example:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse playwright-test \
  --source=. \
  --test-selector=tests/smoke/login.spec.ts
```

Deploy Firebase Hosting:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse deploy-webhosting \
  --source=. \
  --project-id=<firebase-project-id> \
  --gcp-credentials=env:GCP_CREDENTIALS
```

## When a GitHub token is needed

This module no longer requires `NODE_AUTH_TOKEN` for public repositories by default.

A token is only needed when the target repository installs private packages from GitHub Packages, such as `@staytunedllp/*` packages that are not publicly readable. In that case, pass:

```bash
--node-auth-token=env:NODE_AUTH_TOKEN
```

If the repository uses only public npm packages, you can omit the token entirely.

## Playwright and npm caching behavior

The `playwright-test` flow enables both npm and Playwright browser cache mounts by default.

- npm cache path: `/root/.npm`
- Playwright browser cache path: `/root/.cache/ms-playwright`

In CI/CD, cache reuse depends on whether the Dagger cache volumes persist between runs (for example, persistent ARC/Dagger engine storage). If runs are fully ephemeral without shared cache state, dependencies and browsers may be reinstalled.

## Internal helper exports

This repository also exports plain TypeScript helpers for internal reuse:

- `createBaseNodeContainer`
- `createNodeWorkspace`
- `withNpmAuth`
- `withNpmCache`
- `withPlaywrightCache`
- `withLockfilesOnly`
- `withInstalledDependencies`
- `withFullSource`
- `withPlaywrightSystemDeps`
- `withPlaywrightBrowsers`
- `runNpmScript`
- `requirePackageLock`
- `withFirebaseCli`
- `withFirebaseSystemPackages`
- `runNodeChecks`
- `prepareNodeWorkspace`
- `runPlaywrightTests`
- `firebaseDeployWebhostingPipeline`
