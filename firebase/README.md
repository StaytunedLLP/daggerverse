# Firebase Dagger Module

This module provides a reusable pipeline for building and deploying applications to Firebase.

## Cache Contract

This module follows the ARC + Dagger cache policy:

- Shared package cache volume: `st-node24-npm` mounted at `/root/.npm`.
- Shared cache is intentionally cross-repo for npm's content-addressed store.
- Deploy entrypoint (`firebaseDeploy`) is `@func({ cache: "never" })` so deploy side effects are never skipped.
- Build speed still comes from Dagger layer cache and the npm cache volume.
- Runtime split:
  - install/build uses `nodeBase()` (Node + npm cache).
  - deploy uses `firebaseCliBase()` (Node + npm cache + firebase-tools).

For repo-specific mutable caches (for example `.eslintcache` and `*.tsbuildinfo`), use repo-scoped cache volume names in caller modules/workflows.

## API Design Note

Avoid one function with flags like `isLint=true` / `isTest=true`.
Prefer explicit functions (`lint`, `test`, `formatCheck`, `build`) so cache policy per function stays clear and safe.

## Usage

```bash
dagger call firebase-deploy --source . --project-id YOUR_PROJECT_ID --gcp-credentials file:./path/to/creds.json
```

## Functions

### firebaseDeploy

Automatically installs dependencies, builds the project, and deploys to Firebase.

| Argument | Type | Description |
| --- | --- | --- |
| source | Directory | The project source code. |
| projectId | string | Google Cloud Project ID. |
| gcpCredentials | File | JSON credentials file for authentication. |
| appId | string (optional) | Firebase App ID. |
| only | string (optional) | Firebase deploy filter (e.g., 'hosting', 'functions'). |
| frontendDir | string (optional) | Path to the frontend directory. |
| backendDir | string (optional) | Path to the backend directory. |
| firebaseDir | string (optional) | Directory containing firebase.json. |
