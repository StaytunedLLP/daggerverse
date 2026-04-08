# format, lint, build, and test checks

Back to the [Checks index](./README.md) or the [docs index](../README.md).

## What they do

The module exposes four standard repository checks through the `Checks` object:

- `format`
- `lint`
- `build`
- `test`

These functions run the usual npm scripts in a prepared Dagger workspace.

## Why they exist

Most repositories already know how to check themselves through npm scripts. These Dagger functions reuse that existing contract instead of inventing a new one.

## Main inputs

Each check mainly needs:

- `source` — the repository directory to validate

The checks run against the standard script names expected by the module:

- `npm run format:check`
- `npm run lint`
- `npm run build`
- `npm run test`

## What happens internally

At a high level, these checks:

1. create a prepared Node workspace
2. install dependencies
3. overlay the repository source
4. run the requested npm script in the selected package path or root

## How this repo uses the idea

The logic for these checks lives in `/home/runner/work/daggerverse/daggerverse/src/checks/node-checks.ts`, and the public check methods are exposed from `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`.

## How other repos can reuse them

These checks work best in repositories that already have consistent npm scripts. They can be used as simple PR checks, branch protection checks, or pre-release validation steps.

## Best-fit scenarios

- run standard validation in pull requests
- keep validation behavior consistent across many repositories
- use the same Dagger check layer for root projects and monorepos

## Common mistakes or limits

- If the target repo does not define the expected npm scripts, these checks will fail.
- If dependencies cannot be installed, the checks will fail before the script phase.
- These functions do not replace repository-specific test strategy; they just run the repository's own scripts.

## Related docs

- [checks().install](./install.md)
- [Use cases](../use-cases.md)
- [Troubleshooting](../troubleshooting.md)
