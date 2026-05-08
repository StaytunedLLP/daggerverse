# Staydevops Dagger Module

Shared Dagger module for Staytuned TypeScript repositories.

This repo is published to Daggerverse as the `staydevops-ts` module and exposes reusable checks and helper functions for:

- installing Node workspaces
- preparing Playwright-ready CI containers
- validating package prerequisites
- deploying Firebase Hosting projects

## Module API

### Checks (`checks()`)

A collection of repository validation tools:

- `install`: installs dependencies and can optionally install Playwright browsers and Firebase tooling
- `format`: runs `npm run format:check`
- `lint`: runs `npm run lint`
- `build`: runs `npm run build`
- `test`: runs `npm run test`
- `test-playwright`: installs dependencies, provisions Playwright browsers, optionally runs build, and executes E2E tests

### Functions

- `check-pr-title`: validates the PR title against Conventional Commits. Optionally posts a comment to the PR on failure if `--github-token` is provided.
- `git-diff`: retrieves changed files based on mode (`staged`, `previous`, `between`)
- `fb-apphosting`: performs actions (`deploy`, `delete`) on Firebase App Hosting backends
- `fb-webhosting`: installs, builds, and deploys a Firebase web hosting project
- `release-package`: compares PR versions against `main` and bumps to `main + 1`, or publishes the canonical main-branch package release

## Usage

List the module API:

```bash
dagger functions -m github.com/StaytunedLLP/daggerverse
```

Run a check against the current repository:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse checks format --source=.
```

Warm a workspace with Playwright installed:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse checks install \
  --source=. \
  --playwright-install=true
```

Prepare a repository that uses private `@staytunedllp/*` packages:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse checks install \
  --source=. \
  --node-auth-token=env:NODE_AUTH_TOKEN
```

Run Playwright E2E tests:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse checks test-playwright \
  --source=. \
  --package-paths=apps/web \
  --test-script=test:e2e
```

Deploy Firebase App Hosting:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse fb-apphosting \
  --action deploy \
  --source . \
  --project-id=<firebase-project-id> \
  --backend-id=<backend-id>
```

Deploy Firebase Web Hosting:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse fb-webhosting \
  --source=. \
  --project-id=<firebase-project-id> \
  --gcp-credentials=env:GCP_CREDENTIALS
```

Compare a pull request against `main` and bump to the next safe patch version:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse release-package \
  --action=sync-pr-version \
  --source=. \
  --github-token=env:GITHUB_TOKEN \
  --repo-owner=StaytunedLLP \
  --repo-name=daggerverse
```

Publish the canonical package version from `main`:

```bash
dagger call -m github.com/StaytunedLLP/daggerverse release-package \
  --action=publish \
  --source=. \
  --github-token=env:GITHUB_TOKEN \
  --repo-owner=StaytunedLLP \
  --repo-name=daggerverse
```

## Release pipeline assumptions

- `release-package --action=sync-pr-version` compares the PR version against `main` and bumps to `main + 1` when needed.
- `release-package --action=publish` only publishes the exact version already present in `package.json`.
- The module commits and pushes PR version bumps, and it pushes the release tag after a successful publish.

## When a GitHub token is needed

This module no longer requires `NODE_AUTH_TOKEN` for public repositories by default.

A token is only needed when the target repository installs private packages from GitHub Packages, such as `@staytunedllp/*` packages that are not publicly readable. In that case, pass the token to any check that needs the workspace installed first:

```bash
--node-auth-token=env:NODE_AUTH_TOKEN
```

That applies to `checks install`, `checks format`, `checks lint`, `checks build`, `checks test`, and `checks test-playwright` when the repository depends on private npm packages.

If the repository uses only public npm packages, you can omit the token entirely.

## Playwright and npm caching behavior

The `test-playwright` flow enables both npm and Playwright browser cache mounts by default.

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
- `gitDiffStaged`
- `gitDiffPrevious`
- `gitDiffBetweenCommits`
- `releasePackage`
