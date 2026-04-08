# Firebase App Hosting

Back to the [Firebase index](./README.md) or the [docs index](../README.md).

## What it does

`fbApphosting(...)` manages Firebase App Hosting backends.

It supports two main actions:

- deploy a backend
- delete a backend

## Why it exists

App Hosting deploys need environment preparation, authentication, backend checks, and deployment commands. This function groups those steps into one reusable flow.

## Main inputs

Important inputs include:

- `action`
- `projectId`
- `backendId`
- `source` for deploys
- `rootDir`
- `appId`
- `region`
- `gcpCredentials`
- `wifProvider`
- `wifServiceAccount`
- `wifOidcToken`
- `wifAudience`

## Supported authentication modes

The function supports two auth patterns:

### Service account credentials
Use `gcpCredentials` when you want to mount a JSON service account credential into the container.

### Workload Identity Federation
Use `wifProvider`, `wifServiceAccount`, and `wifOidcToken` when you want short-lived federated access instead of long-lived credential files.

## What happens internally

For deploys, the flow:

1. creates a Firebase App Hosting base container
2. mounts the source repository
3. writes a `firebase.json` file with backend details
4. authenticates using either service account credentials or WIF
5. checks whether the backend already exists
6. creates the backend if needed
7. runs Firebase deploy commands
8. reads backend details and returns the deployed URL when available

For delete operations, the function authenticates and runs the backend deletion command.

## How this repo uses the idea

The public method is exposed from `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, while the main deploy and delete logic lives in `/home/runner/work/daggerverse/daggerverse/src/firebase/app-hosting.ts`.

## How other repos can reuse it

Use this when another repository deploys an application through Firebase App Hosting and wants shared deployment behavior.

## Best-fit scenarios

- managed deploys for App Hosting backends
- standardized auth handling across repositories
- Dagger-based deploy jobs in CI/CD

## Common mistakes or limits

- Deploy requires `source`; delete does not.
- You must provide either `gcpCredentials` or the full WIF set.
- Project IDs, backend IDs, and region values must match real Firebase resources.

## Related docs

- [Firebase Web Hosting](./web-hosting.md)
- [Integration in other repos](../integration/using-in-other-repos.md)
- [Troubleshooting](../troubleshooting.md)
