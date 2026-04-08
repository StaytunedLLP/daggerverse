# FAQ

Back to the [docs index](./README.md).

## Do I need this module for every repository?

No. Use it when a repository benefits from shared CI/CD setup. Small repositories may only need one part of it.

## When do I need `NODE_AUTH_TOKEN`?

You usually need it when the target repository installs private npm packages. Public-package repositories often do not need it.

## What is cached?

The shared layer is designed around:

- npm cache at `/root/.npm`
- Playwright browser cache at `/root/.cache/ms-playwright`

Actual cache reuse depends on whether the Dagger engine environment keeps cache volumes between runs.

## Can I use only one part of the module?

Yes. A repository can use only checks, only Playwright support, only Firebase deploy helpers, or only publish logic.

## Can this work outside Staytuned repositories?

Yes, as long as the consuming repository matches the expectations of the selected feature, such as npm scripts, lockfiles, credentials, and project inputs.

## Where should I start if I am new?

Start with:

- [Module overview](./module-overview.md)
- [Architecture](./architecture.md)
- [Use cases](./use-cases.md)
