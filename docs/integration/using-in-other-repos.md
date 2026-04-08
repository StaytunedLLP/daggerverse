# Using the module in other repositories

Back to the [Integration index](./README.md) or the [docs index](../README.md).

## How another repository uses this module

Another repository does not need to copy this code. It can call the module through Dagger and pass its own repository as the `source` input.

## Common adoption paths

### 1. Checks only
Use the checks API when the target repository already has working npm scripts and just needs a standard Dagger-based validation layer.

### 2. Prepared install workspace
Use `checks().install(...)` when the target repository needs dependency installation, private package auth, Playwright setup, or Firebase tooling before later steps.

### 3. Playwright in CI
Use `testPlaywright(...)` when the target repository wants one reusable Playwright job with browser setup and optional affected-test logic.

### 4. Firebase deployment
Use `fbApphosting(...)` or `fbWebhosting(...)` when the target repository deploys through Firebase and wants shared deploy logic.

### 5. Package publishing
Use `publishPackage(...)` when the target repository publishes npm packages and wants shared release rules.

## Inputs another repo usually needs

Depending on the workflow, a consuming repo may need to pass:

- a `source` directory
- a `NODE_AUTH_TOKEN` or similar package auth secret
- project IDs and backend IDs for Firebase
- GCP credentials or WIF inputs
- git refs or changed file context
- repository owner and name for publish flows

## Integration style

The easiest mental model is:

1. your repository keeps its own source code and npm scripts
2. this module provides the reusable Dagger logic around setup, validation, deployment, and publishing
3. you call only the functions you need

## Good reuse patterns

- keep repository-specific app logic in the consuming repo
- keep repeated CI/CD setup logic in this shared module
- start with one feature, then expand if it works well

## When not to use the full module

You may not need every feature. For example:

- a small repo may only need checks
- a frontend repo may only need Playwright and Firebase deploy helpers
- a package repo may only need publish logic

## Related docs

- [Module overview](../module-overview.md)
- [Use cases](../use-cases.md)
- [FAQ](../faq.md)
