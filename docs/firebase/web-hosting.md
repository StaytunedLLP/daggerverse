# Firebase Web Hosting

Back to the [Firebase index](./README.md) or the [docs index](../README.md).

## What it does

`fbWebhosting(...)` runs a higher-level web hosting pipeline for Firebase Hosting projects.

It can prepare packages, build application code, inject frontend environment values, and deploy the final site.

## Why it exists

Web Hosting deploys usually combine several steps that belong together:

- install dependencies
- prepare frontend configuration
- build the app
- deploy to Firebase Hosting

This function keeps that workflow in one place.

## Main inputs

Important inputs include:

- `source`
- `projectId`
- `gcpCredentials`
- `appId`
- `only`
- `frontendDir`
- `backendDir`
- `firebaseDir`
- `webappConfig`
- `extraEnv`
- `nodeAuthToken`

## What happens internally

At a high level, the pipeline:

1. determines which package directories need installation
2. installs dependencies for the selected directories
3. injects frontend environment values when needed
4. builds the selected project directories
5. runs Firebase Hosting deployment commands

## How this repo uses the idea

The public API is exposed from `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, and the orchestration logic lives in `/home/runner/work/daggerverse/daggerverse/src/firebase/pipeline.ts`.

## How other repos can reuse it

This is useful for repos that have a frontend package, maybe a related backend package, and want one reusable deploy step for Firebase Hosting.

## Best-fit scenarios

- frontend deploys that depend on injected Firebase config
- monorepos with a dedicated frontend directory
- repos that need one shared Hosting deploy path across teams

## Common mistakes or limits

- The target directories still need valid `package.json` and `package-lock.json` files.
- The frontend build must already be defined in the repository's npm scripts.
- The deploy still depends on valid Firebase project and credential inputs.

## Related docs

- [Firebase App Hosting](./app-hosting.md)
- [Use cases](../use-cases.md)
- [Troubleshooting](../troubleshooting.md)
