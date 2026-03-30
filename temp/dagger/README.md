# Staylook Dagger Module

Local Dagger module for `staylook-ts` CI.

This module depends on the private `@staytunedllp/staydevops-ts` package from the
private `devops` repository. Publish that package before running this module in
CI.

## Typical commands

```bash
dagger check -m ./dagger
dagger call -m ./dagger warm-workspace
dagger call -m ./dagger test-playwright --selector src/components/block/action/sl-button/tests/sl-button.a11y.test.ts
dagger call -m ./dagger test-playwright --all
dagger call -m ./dagger test-playwright --list-only
dagger call -m ./dagger test-playwright --base origin/main
```

## Test-playwright flow

The Dagger module now provides a unified entry point for all end-to-end and Playwright testing:

- `test-playwright`: a single function that handles affected discovery, manual selection, and full workspace runs.

Capabilities:

- **Run all tests**: `dagger call test-playwright --all`
- **Run affected tests**: `dagger call test-playwright` (default)
- **Manual selection**: `dagger call test-playwright --selector "src/components/block/action"`
- **List tests only**: `dagger call test-playwright --list-only` (works with all modes)

Execution profile:

- **Discovery mode** (`--list-only`) uses a lightweight workspace path (`npm ci`) and does **not** run build or Playwright browser/deps installation.
- **Execution mode** uses the full Playwright workspace setup before running tests.
- Reuses mounted caches for npm, Playwright browser artifacts, and apt metadata.
- Chromium browser download is skipped when `/root/.cache/ms-playwright/chromium-*` already exists in cache.

By default, the function uses:

- selector command: internal Dagger selector engine (`__internal_affected_selectors__`)
- selector mode: `--list-tests`
- test command: `npm run test:e2e`

These defaults are configurable through function arguments, although the unified `test-playwright` interface covers most common integration needs.

## Repository prerequisites

To use `test-playwright` in another repository, ensure all of the following exist:

1. Node workspace install/build works in CI (`npm ci`, `npm run build` or equivalent).
2. Playwright test command exists (`npm run test:e2e` by default).
3. If overriding selector resolution, the custom selector command must print selectors as whitespace-separated values.
4. CI can resolve git base refs (`origin/main` or PR base branch).
5. `NODE_AUTH_TOKEN` (or `GITHUB_TOKEN`) is available for private npm installs.
6. Dagger engine bootstrap is configured on ARC runners before `dagger call`.

## GitHub Actions usage (minimal)

Use a thin workflow and keep the test-selection logic in the Dagger function:

```yaml
- name: Run tests via Dagger
  shell: bash
  run: |
    BASE_REF="${{ github.base_ref || 'main' }}"
    dagger call -m ./dagger test-playwright --source . --base "origin/$BASE_REF" --node-auth-token env:NODE_AUTH_TOKEN
```

## How to validate test-playwright end-to-end

  Use one component with a known Playwright test directory, for example:

- component file to edit: `src/components/block/action/sl-button/index.ts`
- expected selector directory: `src/components/block/action/sl-button/tests`

  Recommended validation path:

  1. Create a small non-doc change in `src/components/block/action/sl-button/index.ts`.
  2. Push the branch and open/update a PR.
  3. Wait for `Affected Tests (Dagger)` workflow to run.
  4. In logs, verify these phases:
     - Dagger module invocation of `test-playwright`
     - selector resolution (affected discovery)
     - test execution (`npm run test:e2e -- <selectors>`)

  Expected CI behavior:

- If only `sl-button` is affected, selectors should include `src/components/block/action/sl-button/tests`.
- If shared infra files changed (`package.json`, `tsconfig.json`, `playwright.config.ts`, or lockfiles), broader package/test selection is expected.
- If no affected selectors are found, the function returns `No affected tests detected.` and exits successfully.

  Local reproduction tip:

- You can simulate changed files by setting `CHANGED_FILES` before `dagger call`.
- Ensure `NODE_AUTH_TOKEN` is available locally, otherwise workspace preparation can fail before selector execution.

## Migration guidance for another repo

To avoid code duplication:

1. Keep workflow YAML minimal (`checkout`, `dagger bootstrap`, `dagger call`).
2. Put test-selection + test execution behavior in the Dagger module only (`test-playwright`).
3. Reuse the same Dagger entrypoint across PR and manual workflows.

## Caching & Layering Architecture

The `test-playwright` and `warm-workspace` functions are specifically layered to maximize layer caching and drastically reduce CI container provisioning durations:

1. **Strict Lockfile Environment**: The module first provisions the container purely using `package.json` and `package-lock.json` and runs `npm ci`. This allows identical npm environments to be cached globally.
2. **Setup Before Source Mount**: The Playwright operating system dependencies (via `npx playwright install-deps chromium`) and the Chromium binary are intentionally executed *after* the lockfile installation but **before** the main source code is mounted into the container workspace.
3. **APT Caching Volumes**: `/var/cache/apt` and `/var/lib/apt/lists` are mounted as persistent `CacheVolumes` throughout image building.

As a result, modifying standard component source code (like `sl-button/index.ts`) only invalidates the final source mounting step, guaranteeing that the 5-8 minute heavy dependency installation phases execute instantaneously via cache.
