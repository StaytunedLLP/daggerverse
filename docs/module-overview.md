# Module overview

Back to the [docs index](./README.md).

## What this module does

`staydevops-ts` is a reusable Dagger module for Node and TypeScript repositories.

Its job is to make common CI/CD work easier and more consistent. Instead of rewriting the same setup logic in every repository, teams can call this module for things like:

- installing dependencies in a predictable way
- running format, lint, build, and test checks
- preparing Playwright test environments
- deploying Firebase projects
- looking at changed files with git
- publishing npm packages

## Why it exists

This repository packages shared Dagger logic into one place so other repositories can reuse the same behavior.

That gives teams a few benefits:

- less duplicated CI/CD code
- consistent setup across repositories
- better cache reuse
- safer handling of secrets like npm and GCP credentials
- one place to improve shared delivery workflows

## Main capabilities

### 1. Repository checks
The `Checks` object provides standard validation steps for repositories that already use npm scripts like `format:check`, `lint`, `build`, and `test`.

See [Checks docs](./checks/README.md).

### 2. Workspace preparation
The module can prepare a Node workspace with dependency installation, npm authentication, Playwright tooling, and optional Firebase tooling.

See [checks().install](./checks/install.md).

### 3. Playwright test execution
The module can prepare browsers, install system dependencies, optionally run a build first, and execute Playwright tests. It also supports affected-test selection.

See [testPlaywright](./playwright/test-playwright.md).

### 4. Firebase deployment helpers
The module supports both Firebase App Hosting and Firebase Web Hosting flows.

See [Firebase docs](./firebase/README.md).

### 5. Git-based change detection
The module can list changed files for staged work, the previous commit, or a custom commit range.

See [gitDiff](./git/git-diff.md).

### 6. Package publishing
The module can drive a version-aware publish flow for npm packages, including preview versions for PR-related releases.

See [publishPackage](./publish/publish-package.md).

## What this module is not

This module is not a full application framework. It does not replace your repository's own source code, tests, or deployment configuration. It gives you reusable building blocks around those things.

## Where the main API lives

The main public Dagger API is defined in `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`.

Top-level exports are re-exported from `/home/runner/work/daggerverse/daggerverse/src/index.ts`.
