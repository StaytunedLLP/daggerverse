# Architecture

Back to the [docs index](./README.md).

## High-level structure

This repository is organized by capability. The module's main Dagger entrypoint lives in `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, and it delegates most real work to smaller feature folders.

## Main layers

### Top-level API layer
`/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`

This file is the main module surface. It exposes functions such as:

- `checkPrTitle`
- `checks()`
- `testPlaywright`
- `gitDiff`
- `fbApphosting`
- `fbWebhosting`
- `publishPackage`

This top layer mostly routes inputs to focused helper modules.

### Feature layers
The next layer is made of feature folders:

- `/home/runner/work/daggerverse/daggerverse/src/checks`
- `/home/runner/work/daggerverse/daggerverse/src/copilot`
- `/home/runner/work/daggerverse/daggerverse/src/playwright`
- `/home/runner/work/daggerverse/daggerverse/src/firebase`
- `/home/runner/work/daggerverse/daggerverse/src/git`
- `/home/runner/work/daggerverse/daggerverse/src/publish`

Each folder owns one clear area of behavior.

### Shared foundation layer
`/home/runner/work/daggerverse/daggerverse/src/shared`

This folder is the base layer used across the rest of the module. It handles common workspace and container behavior such as:

- base Node container setup
- npm authentication
- npm cache mounting
- Playwright cache mounting
- lockfile-first dependency installation
- full source mounting and overlay behavior
- common path handling and script execution

## Design ideas behind the module

### 1. One capability per folder
The code is easier to understand because each major workflow has a home.

### 2. Shared setup is centralized
Instead of repeating container and npm setup logic in every feature, the module uses shared helpers.

### 3. Cache-friendly behavior
The shared workspace layer mounts npm and Playwright cache locations and installs dependencies using a lockfile-first pattern.

### 4. Secret-aware integration
Tokens and credentials are passed as Dagger `Secret` values instead of plain text strings where possible.

## Simple map from docs to code

- Checks docs → `/home/runner/work/daggerverse/daggerverse/src/checks`
- Playwright docs → `/home/runner/work/daggerverse/daggerverse/src/playwright`
- Firebase docs → `/home/runner/work/daggerverse/daggerverse/src/firebase`
- Git docs → `/home/runner/work/daggerverse/daggerverse/src/git`
- Publish docs → `/home/runner/work/daggerverse/daggerverse/src/publish`
- Shared helper docs → `/home/runner/work/daggerverse/daggerverse/src/shared`

## How this helps other repositories

Because the public API is thin and the shared setup is centralized, other repositories can call only the parts they need. A repo can use just checks, just Playwright support, just Firebase helpers, or the whole set together.
