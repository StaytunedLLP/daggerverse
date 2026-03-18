# AGENTS.md

This file is the single source of truth for AI agents and contributors working in this repository.

It intentionally combines **module context + execution rules** into one cohesive guide so behavior stays powerful, predictable, and reusable across repos.

## Priority: Dagger Module Guidelines (Complete)

Treat this section as the highest-priority implementation policy for this repository.

### Core Principles

1. **Performance (next-level caching)**
   - Workflows must be fast and cache-efficient.
   - Use Dagger layer caching and `cacheVolume` mounts intentionally.

2. **Infrastructure security**
   - All Dagger operations in GitHub Actions must run on internal ARC infrastructure (`st-arc`).

3. **Generalization (multi-repo ready)**
   - Do not hardcode repository-specific paths, scripts, or assumptions.
   - Use defaults that work broadly with override-friendly function parameters.

### Mandatory CI Runner + Bootstrap for Dagger

Any GitHub Actions job that invokes Dagger must:

1. set `runs-on: st-arc`
2. bootstrap the Dagger engine on ARC before any Dagger call

```yaml
jobs:
  job_name:
    runs-on: st-arc

    steps:
      - name: Bootstrap Dagger (ARC)
        uses: staytunedllp/devops/.github/actions/dagger-bootstrap@main
        with:
          namespace: dagger
          label_selector: name=dagger-engine
          prefer_same_node: "true"
```

### Dagger Module Authoring Standards (TypeScript)

1. **Decorator safety (mandatory)**
   - Never use imported constants directly inside decorator metadata.
   - Inline decorator values (e.g., `@argument({ ignore: [".git", "dist"] })`) to avoid introspection instability.

2. **Check visibility (mandatory)**
   - Public validation checks should include both `@check()` and `@func()`.

3. **TSDoc for public API (mandatory)**
   - Public module members must be documented.

4. **Export discipline (mandatory)**
   - New public functionality must be exported via `src/index.ts`.

5. **Command consistency (mandatory)**
   - Use `dagger call` in examples that pass arguments (e.g., `--source`).
   - Use `dagger check` only for general check-style execution examples.

### Caching and Layering Rules (Mandatory)

1. **Lockfile-first dependency layering**
   - Copy lockfiles and install dependencies before copying full source.
   - Prevent app-code changes from invalidating dependency install layers.

2. **Tool cache mounts**
   - NPM cache path: `/root/.npm`
   - Playwright browser cache path: `/root/.cache/ms-playwright`

3. **Generalized default patterns**
   - Prefer sensible defaults, with explicit overrides when needed.
   - Common baseline defaults:
     - `testScript`: `"test:e2e"`
     - `runBuild`: `true`
     - `registryScope`: `"staytunedllp"`

### Standard GitHub Action Dagger Invocation

Use `dagger/dagger-for-github` and map secrets via environment variables into Dagger `env:` arguments.

```yaml
- name: Dagger Call
  uses: dagger/dagger-for-github@v8.3.0
  with:
    version: "0.20.0"
    verb: call
    module: github.com/StaytunedLLP/devops/<module_path>@main
    args: <function_name> --source=. --auth-token=env:AUTH_TOKEN
  env:
    AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Repository Context

This repo publishes the `staydevops-ts` Dagger module (package: `@staytunedllp/daggerverse`) and provides reusable CI/CD helpers for Node/TypeScript projects, including:

- repository checks (`format`, `lint`, `build`, `test`)
- workspace preparation for Node/Playwright/Firebase workflows
- Firebase Hosting deployment pipeline support

Primary code locations:

- `src/staydevops-ts.ts` — module API entrypoint
- `src/checks/` — check execution logic
- `src/copilot/` — workspace prep helpers
- `src/firebase/` — Firebase deployment pipeline
- `src/shared/` — common container/workspace helpers

## Local Development Commands

## Setup & Build

- Install dependencies: `npm install`
- Build the project: `npm run build`
- Clean build artifacts: `npm run clean`

## Project Structure

- `src/staydevops-ts.ts`: Main entry point for the Dagger module.
- `src/checks/`: Implementation of repository checks (format, lint, build, test).
- `src/firebase/`: Firebase deployment logic.
- `src/copilot/`: Node workspace preparation helpers.
- `src/shared/`: Shared utilities and constants.

## Development Guidelines

- This is a Dagger module written in TypeScript.
- **Decorator Safety**: Do NOT use imported constants inside decorators (e.g., `@argument({ ignore: CONSTANT })`). Inline the values to prevent Dagger Engine introspection crashes.
- **Visibility**: Use both `@check()` and `@func()` decorators for validation methods to ensure they appear in both `dagger check -l` and `dagger functions`.
- **Command Consistency**: Examples with custom arguments (like `--source`) must use `dagger call`. Use `dagger check` only for general, argument-free validation runs.
- **TSDoc**: Use TSDoc for all public-facing module members to ensure they are documented in Daggerverse.
- **Exports**: When adding new functionality, export it from `src/index.ts`.

## Testing

- Local verification: Run `npm run build` to ensure TypeScript compilation passes.
- Module verification: Use `dagger call` from a sample repository to test the module functions.

## References & Documentation

- [Dagger Glossary](https://docs.dagger.io/reference/glossary): Definitions of key terminology.
- [Core Concepts](https://docs.dagger.io/core-concepts): Understanding the Dagger Engine and architecture.
- [Dagger Features](https://docs.dagger.io/features): Overview of what Dagger can do.
- [Extending Dagger](https://docs.dagger.io/extending): How to build and share Dagger modules.
- [Dagger API Reference](https://docs.dagger.io/getting-started/types): Comprehensive reference for all Dagger types, functions, and modules.
