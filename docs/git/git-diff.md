# gitDiff

Back to the [Git index](./README.md) or the [docs index](../README.md).

## What it does

`gitDiff(...)` returns changed file paths using git inside a Dagger container.

It supports three modes:

- `staged`
- `previous`
- `between`

## Why it exists

Many CI decisions depend on knowing what changed. This function gives the rest of the module a simple way to ask for that information.

## Main inputs

Important inputs include:

- `source`
- `mode`
- `commitRange` when mode is `between`

## What each mode means

### staged
Lists files staged for commit.

### previous
Lists files from the previous commit diff.

### between
Lists files changed in a custom commit range.

## What happens internally

At a high level, the function:

1. creates a lightweight git container
2. mounts the source repository
3. runs the matching git command for the selected mode
4. returns the file list as an array

## How this repo uses the idea

The public method is exposed in `/home/runner/work/daggerverse/daggerverse/src/staydevops-ts.ts`, and the lower-level implementation lives in `/home/runner/work/daggerverse/daggerverse/src/git/git-diff.ts`.

## How other repos can reuse it

Use this when another repository wants change-aware automation, such as:

- running only affected test logic
- finding changed application folders
- deciding whether a deploy should run

## Best-fit scenarios

- pull request automation
- selective validation
- diff-aware release workflows

## Common mistakes or limits

- `between` mode requires a valid `commitRange`.
- The underlying repository history must exist for the selected comparison.
- This helper only reports paths; other workflows must decide what to do with them.

## Related docs

- [testPlaywright](../playwright/test-playwright.md)
- [Use cases](../use-cases.md)
