# Migration Plan: Reusable GitHub Actions Workflows (Dagger-Powered)

## Goal

Consolidate repository-specific YAML workflows from `temp/` into a centralized, reusable workflow library in the `current` repository. This will minimize boilerplate across all StaytunedLLP repositories while leveraging the `daggerverse` module for high-performance CI/CD.

## Context & References

- **Source Logic (Legacy):** Located in `staydevops-ts/temp/` (folders: `checks/`, `apphosting/`, `publish/`, `webhosting/`).
- **Core Engine:** The `Staydevops-TS` Dagger module (source: `devops/src/staydevops-ts.ts`).
- **Target Repo:** `staytunedllp/devops/.github/workflows/`.

---

## 1. Core Principles

- **One Reusable per Domain:** Each functional area (Checks, Tests, Hosting, Publish) must have exactly **one** `.yml` file in the `devops` repo.
- **Parametrization:** Use `workflow_call` inputs for:
  - `module-version` (default: `@main`).
  - `source-path` (default: `.`).
  - Flag-based toggles (e.g., `run-lint: true`).
- **Standardized Infrastructure:** All jobs must run on `runs-on: st-arc` and use the internal `dagger-bootstrap` action.

---

## 2. Targeted Reusable Workflows

### A. `reusable-node-checks.yml` (Domain: Checks)

- **Source:** `temp/checks/pr-checks.yml`.
- **Dagger Hook:** `checks().install()`, `checks().lint()`, `checks().format()`, `checks().build()`.
- **Inputs:** `lint` (bool), `format` (bool), `build` (bool), `package_paths` (string).
- **Behavior:** Runs all selected checks in a single job to maximize layer caching.

### B. `reusable-affected-tests.yml` (Domain: Testing) - _[Completed]_

- **Dagger Hook:** `testPlaywright()`.
- **Inputs:** `run-affected` (bool), `base-branch` (string).
- **Behavior:** Dynamically calculates `git diff` and executes only impacted Playwright tests.

### C. `reusable-fb-apphosting.yml` (Domain: App Hosting)

- **Source:** All 6 files in `temp/apphosting/`.
- **Dagger Hook:** `fb-apphosting()`.
- **Inputs:** `action` ('deploy'|'delete'), `backend_id`, `project_id`, `environment`.
- **Behavior:**
  - Handles WIF (Workload Identity Federation) authentication.
  - Automatically comments deployment URLs on PRs via `github-script`.
  - Cleans up ephemeral backends on PR close.

### D. `reusable-package-publish.yml` (Domain: Publishing)

- **Source:** `temp/publish/publish-private-module-*.yml`.
- **Dagger Hook:** `publish-package()`.
- **Inputs:** `repo_owner`, `repo_name`, `input_branch`.
- **Behavior:**
  - Detects if the trigger is a PR (Pre-release) or Ref (Final Release).
  - Handles security-scoped tokens for npm and GitHub Releases.

---

## 3. Implementation Steps for Coding Agent

1. **Step 1:** Read existing logic in `staydevops-ts/temp/`.
2. *Step 2:** Read the dagger verse modules code in https://github.com/StaytunedLLP/daggerverse/blob/main/README.md and other relabvant source code of that repo and its files to understand how to use it for the reusable workflows.
3. **Step 3:** Generate the reusable workflow in `.github/workflows/` with proper `inputs` and `secrets`.
4. **Step 4:** Validate the workflow syntax and ensure it adheres to GitHub Actions best practices.
5. **Step 5:** Document the usage of each reusable workflow in the `Use.md` file.
6. **Step 6:** Make sure these reusabel workfwlo are meant to be used in oter repo with juust input needsto ob echanegs the temp fodler contan refernce fos make sure you use it in that manner


## 4. Constraint Checklist

- [ ] No hardcoded repo names inside reusable workflows.
- [ ] Use `secrets: inherit` or explicit `secrets` inputs for WIF/Auth.
- [ ] Ensure `st-arc` runner is used everywhere.
- [ ] Add `workflow_dispatch` for manual overrides.
