# @staytunedllp/staydevops-ts

Shared TypeScript Dagger exports for Staytuned repositories.

The package is the root Dagger module for the shared Staytuned CI/CD logic and
is also published as a private npm package for application repositories that
want to import shared helpers.

## Structure

- `src/staydevops.ts`
- `src/shared`
- `src/checks`
- `src/copilot`
- `src/firebase`
- `src/index.ts`
- `dagger.json`
- `package.json`

## Exports

- Root Dagger object:
  `StayDevops`
- Shared workspace utilities:
  `createBaseNodeContainer`, `createNodeWorkspace`, `withNpmAuth`,
  `withNpmCache`, `withPlaywrightCache`, `withLockfilesOnly`,
  `withInstalledDependencies`, `withFullSource`, `withPlaywrightSystemDeps`,
  `withPlaywrightBrowsers`, `runNpmScript`, `requirePackageLock`,
  `withFirebaseCli`, `withFirebaseSystemPackages`
- Checks:
  `runNodeChecks`
- Copilot:
  `prepareNodeWorkspace`
- Firebase:
  `installFirebaseDependencies`, `buildFirebaseProjects`,
  `deployFirebaseWebhostingProject`, `firebaseDeployWebhostingPipeline`

## Root Module API

Checks:
- `format`
- `lint`
- `build`
- `test`

Functions:
- `verifyChromiumBidi`
- `prepareNodeWorkspace`
- `deployWebhosting`

## Publishing

This package is published to GitHub Packages from the `devops` repository.

```bash
cd .
npm ci
npm run build
npm publish
```
