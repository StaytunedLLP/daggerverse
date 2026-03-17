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

- Install dependencies: `npm install`
- Build TypeScript output: `npm run build`
- Clean output: `npm run clean`

Minimum local validation for edits in this repo: `npm run build`.

## Additional Engineering Rules

- The section **Priority: Dagger Module Guidelines (Complete)** is the authoritative source for module authoring and workflow behavior.
- Do not introduce parallel or conflicting rules in other docs; extend that priority section instead.

## Validation Expectations

- Local code-level verification: `npm run build`
- Module behavior verification: run representative `dagger call` functions from a sample/target repository

## Agent Behavior Contract

When acting as an AI coding/devops agent in this repository:

- Prefer minimal, targeted changes over broad refactors.
- Preserve existing public APIs unless change is requested.
- Keep docs/examples consistent with real module signatures.
- Validate changes with at least `npm run build` whenever code is modified.
- Favor secure secret handling (`env:`/Dagger `Secret`), never hardcode credentials.

## Reference Docs

- [Dagger Glossary](https://docs.dagger.io/reference/glossary)
- [Dagger Core Concepts](https://docs.dagger.io/core-concepts)
- [Dagger Features](https://docs.dagger.io/features)
- [Extending Dagger](https://docs.dagger.io/extending)
- [Dagger Type Reference](https://docs.dagger.io/getting-started/types)
