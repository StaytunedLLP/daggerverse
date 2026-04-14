---
name: devops-optimization
description: Architect-level DevOps optimization for Dagger workflows on ARC with direct Dagger CLI execution, cache-first module design, and reusable TypeScript composition.
---

# DevOps Optimization Standard

This skill defines optimization standards for Dagger workflows in Staytuned repositories, with a focus on:

- direct `dagger` CLI usage in CI (not wrapper actions)
- Infrastructure alignment (`ubuntu-latest`)
- lockfile-first and cache-volume-first architecture
- reusable TypeScript module composition from shared helpers

## What is it?

A practical architecture + execution policy for CI/CD and Dagger modules so pipelines are fast, secure, maintainable, and reusable across repositories.

## Why use it?

- **Speed**: Prevents redundant `npm install` runs and multi-gigabyte browser downloads.
- **Safety**: Ensures all high-compute tasks run in isolated ARC nodes.
- **Scalability**: Allows a single Dagger module to serve dozens of repositories with zero code changes.
- **Maintainability**: Promotes shared helper composition and stable naming conventions to reduce duplication.

## Procedure: Daggerizing a Workflow

### 1. Runner Setup (ubuntu-latest)

All Daggerized workflows **must** run on `ubuntu-latest`.

```yaml
runs-on: ubuntu-latest
```

### 2. Bootstrapping

Always include the bootstrap step to connect to the internal Dagger engine.

```yaml
- name: Bootstrap Dagger
  uses: staytunedllp/devops/.github/actions/dagger-bootstrap@main
  with:
    namespace: dagger
    label_selector: name=dagger-engine
```

### 3. CI Invocation Rule (Direct CLI Only)

After bootstrap, execute Dagger directly with shell commands.

- ✅ Use: `run: dagger call ...`
- ❌ Do not use: `uses: dagger/dagger-for-github@v8.3.0`

Standard pattern:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - name: Bootstrap Dagger
        uses: staytunedllp/devops/.github/actions/dagger-bootstrap@main
        with:
          namespace: dagger
          label_selector: name=dagger-engine
          prefer_same_node: "true"

      - name: Run Dagger function directly
        run: dagger call --mod github.com/StaytunedLLP/daggerverse@main playwright-test --source .
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Caching Strategy (Next-Level)

Use a **Lockfile-First + Named Cache Volume** strategy:

1. **Mount NPM cache** at `/root/.npm`.
2. **Mount tool caches** (for Playwright, `/root/.cache/ms-playwright`).
3. **Copy lockfiles/manifests first** (not full source).
4. **Run `npm ci`** while lockfile-only layer is active.
5. **Copy full source after install** using explicit excludes (`node_modules`, `.git`, `dist`, `dagger`).

Reference convention from this repo:

- `DEFAULT_NPM_CACHE = "npm-cache-node24"`
- `DEFAULT_PLAYWRIGHT_CACHE = "playwright-cache-node24"`

Naming convention rule:

- Use deterministic cache names: `<tool>-cache-<runtime>`
- Avoid random per-branch/per-commit cache volume names.

### 4. Generalization Rules

- **No hardcoded script names**: expose args (for example, `testScript` default `test:e2e`).
- **Optional/conditional steps**: use booleans like `runBuild` default `true`.
- **Scoped auth**: inject npm auth from `registryScope` + secret inputs; never hardcode tokens.
- **Checks vs functions**:
  - Use `dagger check` for `@check()` APIs with no required args.
  - Use `dagger call` for parameterized execution.

### 5. Module Architecture Rules (TypeScript)

Follow repository style from `src/shared/*` and compose functionality instead of duplicating container logic.

Required structure:

1. Keep primitive helper functions in `src/shared/*` (cache mounts, npm auth, lockfile install, playwright setup).
2. Build feature-level functions by composition (for example: workspace creation + playwright install + script execution).
3. Keep constants centralized in `src/shared/constants.ts`.
4. Enforce strict shell header (`set -euo pipefail`) for multi-command scripts.
5. Keep source exclusion list centralized (`DEFAULT_SOURCE_EXCLUDES`).

Anti-patterns to avoid:

- Re-implementing npm auth/caching logic per module.
- Inlining cache paths across multiple files.
- Using full source copy before dependency install.

## Examples

### Composed Playwright-style function pattern

```typescript
@func()
async test(
  source: Directory,
  nodeAuthToken?: Secret,
  testSelector: string = "",
  testScript: string = "test:e2e",
  runBuild: boolean = true,
  registryScope: string = "staytunedllp"
): Promise<string> {
  // 1) createNodeWorkspace(source, token, options)
  // 2) withPlaywrightSystemDeps(...)
  // 3) withPlaywrightBrowsers(...)
  // 4) withFullSource(...)
  // 5) runNpmScript(...)
}
```

### ARC workflow template (direct CLI)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Bootstrap Dagger
        uses: staytunedllp/devops/.github/actions/dagger-bootstrap@main
      - name: Dagger Call (direct)
        run: dagger call --mod github.com/StaytunedLLP/devops/<module>@main test --source . --node-auth-token env:TOKEN
        env:
          TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Validation and Troubleshooting

Minimum validation when updating Dagger modules:

1. `npm run build`
2. `dagger functions` (confirm function surface)
3. Representative `dagger call ...` invocation

If failures occur, use:

- `dagger call --debug ...`
- `dagger call --interactive ...`

These are preferred first-line debugging paths before broad refactors.
