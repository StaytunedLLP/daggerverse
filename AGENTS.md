# AGENTS.md

This repository contains the `staydevops-ts` Dagger module, which provides shared CI/CD helpers for Node.js and TypeScript projects, specifically focusing on Firebase deployment and Playwright-ready environments.

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

# DevOps Agent Guidelines (Root Workspace)

This repository is the central hub for DevOps automation, Dagger modules, and CI/CD workflows at Staytuned. As the DevOps Agent, you are responsible for maintaining high-performance, secure, and generalized automation.

## Core Principles

1.  **Performance (Next-Level Caching)**: Workflows must be ultra-fast. Use Dagger's layer caching and volume caching effectively.
2.  **Infrastructure Security**: All Dagger operations must run on `st-arc` (Action Runner Controller) located in our private infrastructure.
3.  **Generalization**: Dagger modules should be "Multi-Repo Ready". Avoid hardcoding repository-specific paths, scripts, or build flags.

---

## Mandatory Runner Configuration

Every GitHub Action workflow that utilizes Dagger **MUST** follow this template:

### 1. Runner Requirement
```yaml
jobs:
  job_name:
    runs-on: st-arc # Mandatory for Dagger
```

### 2. Dagger Bootstrapping
Before any Dagger call, you must bootstrap the engine on the ARC node:
```yaml
      - name: Bootstrap Dagger (ARC)
        uses: staytunedllp/devops/.github/actions/dagger-bootstrap@main
        with:
          namespace: dagger
          label_selector: name=dagger-engine
          prefer_same_node: "true"
```

---

## Dagger Module Standards (TypeScript)

When authoring Dagger modules (e.g., in `daggerverse/`), follow these optimization patterns.

### 1. Lockfile-First Caching (Layer Isolation)
**Mandatory**: Do not copy the entire source directory before installing dependencies. This ensures that changes to application code do not invalidate the heavy `npm install` layer.

```typescript
    // 1. Setup Base with common mounts
    const base = dag.container()
      .from("node:24")
      .withMountedCache("/root/.npm", dag.cacheVolume("node-npm-cache"))

    // 2. Copy ONLY lockfiles
    let setup = base.withFile("package.json", source.file("package.json"))
    try {
        setup = setup.withFile("package-lock.json", source.file("package-lock.json"))
    } catch { /* fallback */ }

    // 3. Install (This layer is now cached strictly by lockfile signature)
    const installed = setup.withExec(["npm", "ci"])

    // 4. Finally, copy rest of source
    const fullSource = installed.withDirectory(".", source, {
      exclude: ["node_modules", "dist", ".git", "dagger"]
    })
```

### 2. Binary & Tool Caching
Always mount a `cacheVolume` for heavy binaries or tool-specific caches (e.g., Playwright browsers, Cypress, Go build cache).
- Playwright: `/root/.cache/ms-playwright`
- NPM: `/root/.npm`

### 3. Generalization Pattern
Modules must support multiple repositories. Use default parameters that satisfy common cases but allow overrides.
- `testScript`: default `"test:e2e"`
- `runBuild`: default `true`
- `registryScope`: default `"staytunedllp"`

---

## Workflow Implementation Standard

Use `dagger/dagger-for-github` for consistency. Always pass secrets as environment variables and map them to Dagger parameters.

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

---

## Project Skills

Proactive research and specialized task execution guidelines are stored in `.agent/skills/`.
- **Location**: `.agent/skills/`
- **Standard**: Every skill must have a `SKILL.md` with "What", "Why", and "How" sections.
- **Reference**: Refer to `dev-build-validate` for monorepo health checks.
