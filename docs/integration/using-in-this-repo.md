# Using the module in this repo

Back to the [Integration index](./README.md) or the [docs index](../README.md).

## What this repo is doing

This repository is mainly the source of the module, not a large consumer of it.

That means the main way the module is used in this repo is by being defined, exported, documented, and published from here.

## Key code relationships

### Main API surface
`/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`

This file exposes the public Dagger functions that other repositories will call.

### Re-exports
`/home/runner/work/daggerverse/daggerverse/src/index.ts`

This file re-exports the public pieces so the package has a clean external surface.

### Feature folders
Each feature folder contains the implementation behind the public methods:

- `src/checks` → repository checks
- `src/copilot` → prepared workspace helpers
- `src/playwright` → Playwright test flow
- `src/firebase` → deploy flows
- `src/git` → changed-file helpers
- `src/publish` → publish logic
- `src/shared` → common building blocks

## Supporting repository files

- `/home/runner/work/daggerverse/daggerverse/README.md` gives a short public summary.
- `/home/runner/work/daggerverse/daggerverse/dagger.json` defines the module name.
- `/home/runner/work/daggerverse/daggerverse/.github/workflows/publish-staydevops-ts.yml` publishes the package.
- `/home/runner/work/daggerverse/daggerverse/.github/workflows/pr-checks.yml` is a simple repository workflow, though it currently does not yet showcase the full module usage pattern.

## Why this matters for contributors

When you add or change module functionality in this repo, you usually need to think about three levels:

1. the public API in `src/staydevops-ts.ts`
2. the feature implementation in its folder
3. the shared helper layer if multiple features need the same setup logic

## Best-fit contributor workflow

- add feature logic in the correct feature folder
- expose it from `src/staydevops-ts.ts` when it is public
- re-export related helpers in `src/index.ts` when needed
- update the docs section that matches the feature

## Related docs

- [Architecture](../architecture.md)
- [Shared workspace helpers](../shared/workspace-helpers.md)
