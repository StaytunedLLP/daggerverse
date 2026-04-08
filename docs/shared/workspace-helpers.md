# Workspace and container helper concepts

Back to the [Shared helpers index](./README.md) or the [docs index](../README.md).

## What this layer does

The shared helper layer is the foundation of the module.

It gives the rest of the code a consistent way to:

- create base Node containers
- mount caches
- authenticate to npm registries
- install dependencies from lockfiles
- mount source code into workspaces
- add Playwright browser and system setup

## Why it exists

Without this layer, each feature would need to repeat the same setup logic. Centralizing that logic keeps the module easier to maintain and easier to extend.

## Main concepts

### Base container creation
The module creates a standard Node container so other features start from the same environment.

### npm authentication
Private package access is added only when a token is available. This keeps public-package workflows simpler while still supporting private registry use.

### Cache mounts
The module uses cache mounts for:

- npm cache at `/root/.npm`
- Playwright browser cache at `/root/.cache/ms-playwright`

This helps repeated runs avoid unnecessary downloads when cache storage is available.

### Lockfile-first installs
The module copies package manifests and lockfiles before copying the full source tree. This helps dependency-install layers stay reusable when application code changes.

### Full source and overlay strategies
Some flows replace the workspace content with full source, while others overlay source on top of an already prepared workspace. This lets the module keep install layers separate from source changes.

## How this repo uses it

These helpers are used by multiple features:

- checks rely on them for repeatable installs
- Playwright uses them for prepared browser-ready workspaces
- publish uses them for lockfile-first publish containers
- Firebase-related setup reuses the same overall design ideas even where it uses feature-specific base containers

## How other repos benefit indirectly

Most consuming repositories will not call these helpers directly. They benefit because the public module features are built on top of a consistent shared foundation.

## Best-fit scenarios

- extending the module with a new feature
- understanding why the module is cache-friendly
- tracing how secrets and installs are handled across features

## Common mistakes or limits

- These helpers support public features; they are not meant to replace repository-specific app logic.
- Cache benefits depend on the environment where the Dagger engine runs.

## Related docs

- [Architecture](../architecture.md)
- [checks().install](../checks/install.md)
- [testPlaywright](../playwright/test-playwright.md)
