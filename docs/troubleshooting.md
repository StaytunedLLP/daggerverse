# Troubleshooting

Back to the [docs index](./README.md).

## Missing `package-lock.json`

Several module flows depend on lockfile-first installs. If the target package path does not have a `package-lock.json`, install-based workflows can fail.

See also:

- [checks().install](./checks/install.md)
- [Firebase Web Hosting](./firebase/web-hosting.md)

## Private packages fail to install

If the target repository uses private packages, make sure a valid npm auth secret is passed. Public-package repositories usually do not need this.

See also:

- [checks().install](./checks/install.md)
- [FAQ](./faq.md)

## Firebase authentication does not work

For Firebase flows, make sure you pass either:

- valid GCP JSON credentials, or
- a complete WIF input set where required

See also:

- [Firebase App Hosting](./firebase/app-hosting.md)
- [Firebase Web Hosting](./firebase/web-hosting.md)

## `gitDiff` returns the wrong comparison

Check that you are using the correct mode:

- `staged` for staged work
- `previous` for the prior commit
- `between` for a custom range

Also confirm that the repository history needed for the comparison is available.

See also:

- [gitDiff](./git/git-diff.md)

## Playwright setup fails

Common causes include:

- the target repo does not define the expected Playwright npm script
- browser or system dependency installation was not requested where needed
- the selected package path is wrong
- required private package auth is missing

See also:

- [testPlaywright](./playwright/test-playwright.md)
- [Shared workspace helpers](./shared/workspace-helpers.md)

## Build validation note for this repository

At the time this documentation set was added, the repository's existing `npm run build` command already failed in the local environment because TypeScript could not resolve Dagger and Node-related types. That is a pre-existing build state and not caused by these documentation files.
