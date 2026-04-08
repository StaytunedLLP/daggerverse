# Use cases

Back to the [docs index](./README.md).

This page shows practical ways to use the module.

## 1. Validate every pull request

Use the checks API when a repository already defines normal npm scripts and you want one shared validation path for CI.

Best docs to read next:

- [Checks](./checks/README.md)
- [Format, lint, build, and test checks](./checks/format-lint-build-test.md)

## 2. Prepare a monorepo workspace

Use `checks().install(...)` when you need dependency installation across one or more package paths before later work happens.

Best docs to read next:

- [checks().install](./checks/install.md)
- [Shared workspace helpers](./shared/workspace-helpers.md)

## 3. Run Playwright only for affected tests

Use `testPlaywright(...)` with affected-test mode when you want faster PR feedback and do not want to run the full E2E suite on every change.

Best docs to read next:

- [testPlaywright](./playwright/test-playwright.md)
- [gitDiff](./git/git-diff.md)

## 4. Deploy a Firebase frontend

Use the Firebase Hosting pipeline when you want a single flow that installs dependencies, builds the app, injects config, and deploys.

Best docs to read next:

- [Firebase Web Hosting](./firebase/web-hosting.md)
- [Troubleshooting](./troubleshooting.md)

## 5. Manage an App Hosting backend

Use the App Hosting helper when a repository needs a repeatable deploy or delete flow for a Firebase App Hosting backend.

Best docs to read next:

- [Firebase App Hosting](./firebase/app-hosting.md)

## 6. Publish a package after merge or release prep

Use the publishing helper when version rules, preview versions, and registry conflict checks all matter.

Best docs to read next:

- [publishPackage](./publish/publish-package.md)
- [Integration in other repos](./integration/using-in-other-repos.md)
