# publishPackage

Back to the [Publish index](./README.md) or the [docs index](../README.md).

## What it does

`publishPackage(...)` runs a controlled npm publishing flow.

It handles:

- release context detection
- preview version naming for PR-related publishes
- main release version handling
- registry conflict checks
- dependency installation and package build steps

## Why it exists

Publishing is easy to get wrong when versioning, tags, and registry state all matter. This function puts that logic into one shared pipeline.

## Main inputs

Important inputs include:

- `source`
- `ref`
- `eventName`
- `githubToken`
- `repoOwner`
- `repoName`
- `inputBranch`
- `releasePrNumber`
- `registryScope`

## Release context handling

The function decides whether it is running a preview-style publish flow or a main release flow.

### Preview-style PR publish
When running in PR context, it can create versions like `1.2.3-pre-pr42` and publish under a PR-specific npm tag.

### Main release publish
When running in main release context, it uses the package version directly and targets the standard `latest` tag.

## What happens internally

At a high level, the flow:

1. resolves the publish context from the event inputs
2. reads `package.json`
3. validates the base version
4. resolves the PR number when needed
5. builds the final publish version
6. checks whether that version already exists in the registry
7. prepares a cache-aware Node container
8. applies npm auth
9. installs dependencies using a lockfile-first pattern
10. overlays full source
11. updates the working version used for publishing
12. builds and publishes the package when appropriate

## How this repo uses the idea

This repository defines the public publish method in `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, while the main implementation is in `/home/runner/work/daggerverse/daggerverse/src/publish/index.ts`.

The repository also includes a package publishing workflow at `/home/runner/work/daggerverse/daggerverse/.github/workflows/publish-staydevops-ts.yml`.

## How other repos can reuse it

Use this when another repository publishes an npm package and wants consistent version handling and registry checks.

## Best-fit scenarios

- preview package versions for pull request validation
- controlled release publishing after merges or manual release triggers
- shared publish behavior across several package repositories

## Common mistakes or limits

- The repository still needs a valid package manifest and build flow.
- The event inputs must match the supported publish contexts.
- The publish token must have the permissions required by the target registry and repo.

## Related docs

- [Integration in other repos](../integration/using-in-other-repos.md)
- [Troubleshooting](../troubleshooting.md)
