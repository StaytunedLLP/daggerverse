# staydevops-ts documentation

This folder explains what the `staydevops-ts` Dagger module does, how it is organized, and how to reuse it in other repositories.

## Start here

- [Module overview](./module-overview.md)
- [Architecture](./architecture.md)
- [Use cases](./use-cases.md)
- [Troubleshooting](./troubleshooting.md)
- [FAQ](./faq.md)

## Functionality map

Each main capability has its own section and its own file map from this page.

### Repository checks
- [Checks section](./checks/README.md)
- [Workspace install helper](./checks/install.md)
- [Format, lint, build, and test checks](./checks/format-lint-build-test.md)

### Playwright support
- [Playwright section](./playwright/README.md)
- [testPlaywright](./playwright/test-playwright.md)

### Firebase deployment helpers
- [Firebase section](./firebase/README.md)
- [Firebase App Hosting](./firebase/app-hosting.md)
- [Firebase Web Hosting](./firebase/web-hosting.md)

### Git utilities
- [Git section](./git/README.md)
- [gitDiff](./git/git-diff.md)

### Package publishing
- [Publish section](./publish/README.md)
- [publishPackage](./publish/publish-package.md)

### Integration guidance
- [Integration section](./integration/README.md)
- [How this repo is organized around the module](./integration/using-in-this-repo.md)
- [How other repos can use the module](./integration/using-in-other-repos.md)

### Shared helper layer
- [Shared helpers section](./shared/README.md)
- [Workspace and container helper concepts](./shared/workspace-helpers.md)

## Quick paths

If you are trying to solve a specific problem, start here:

- **I want to run checks in CI** → [Checks](./checks/README.md)
- **I want a prepared Node workspace with private package auth** → [checks().install](./checks/install.md)
- **I want Playwright in CI** → [testPlaywright](./playwright/test-playwright.md)
- **I want to deploy to Firebase** → [Firebase docs](./firebase/README.md)
- **I want to compare changed files** → [gitDiff](./git/git-diff.md)
- **I want to publish a package** → [publishPackage](./publish/publish-package.md)
- **I want to extend the module** → [Shared workspace helpers](./shared/workspace-helpers.md)
- **I want practical examples** → [Use cases](./use-cases.md)
