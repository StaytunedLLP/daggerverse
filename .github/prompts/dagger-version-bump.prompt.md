---
agent: agent
description: "Bump Dagger version across modules/workflows/docs and execute validation commands to ensure nothing breaks. Reusable for any target version."
tools:
  [
    read,
    edit,
    search,
    web,
    github/get_latest_release,
    github/get_release_by_tag,
    github/get_tag,
    todo,
  ]
---

# Dagger Version Bump + Validation (Reusable)

Use this prompt when upgrading Dagger to a new version (not tied to one specific release).

## Inputs

- `targetVersion` (required): Dagger semver without `v` (example: `0.20.1`)
- `scope` (optional): `all-modules` (default) | `root-only` | `custom`
- `customPaths` (optional): comma-separated module/workflow paths when `scope=custom`
- `runSmokeCalls` (optional): `true`/`false` (default: `true`)

## Output Requirements

1. Update all relevant version pins to `targetVersion`.
2. Regenerate SDK artifacts where modules use local `./sdk` bindings.
3. Check official upstream releases/changelogs and explicitly report breaking changes.
4. Execute validation commands and report pass/fail with command outputs.
5. Provide a concise change summary and any follow-up actions.

## Procedure

### 0) Release intelligence (mandatory, before edits)

Use official Dagger sources first:

- GitHub repo: `https://github.com/dagger/dagger`
- Releases list: `https://github.com/dagger/dagger/releases`
- Latest release page (`/releases/latest` or latest tag)
- Tag-specific release page for `targetVersion` (format: `v${targetVersion}`)

Tool execution order (mandatory):

1. Use `github/get_latest_release` for `dagger/dagger`.
2. Use `github/get_release_by_tag` for `v${targetVersion}`.
3. If SDK is in scope (TypeScript in this repo), also check `sdk/typescript/v${targetVersion}` release notes.
4. If tool output is incomplete, fetch web pages from:

- `https://github.com/dagger/dagger/releases`
- `https://github.com/dagger/dagger/releases/latest`
- `https://github.com/dagger/dagger/releases/tag/v${targetVersion}`
- `https://raw.githubusercontent.com/dagger/dagger/main/CHANGELOG.md`

Required checks:

1. Resolve latest stable release and compare it with `targetVersion`.
2. Extract "Breaking Changes" for:

- the target release
- any intermediate releases between current repo version(s) and target

3. Extract SDK coupling notes (for example, `sdk/typescript/vX.Y.Z` relationship to Engine/CLI).
4. Produce a **risk summary** before modifying files:

- `breakingChanges`: list
- `apiSurfaceAtRisk`: list of repo files/functions likely affected
- `requiredMigrations`: list

If official release notes are temporarily unavailable (rate limit/network), retry via alternate official endpoints and continue with explicit warning.

Critical rule:

- Do **not** proceed with version edits until release discovery + breaking-change extraction is complete.

### 1) Inventory and plan

- Find all Dagger-related pins/usages in:
  - `**/dagger.json` (`engineVersion`)
  - `**/package.json` (`@dagger.io/dagger`, peerDependencies/devDependencies)
  - workflow YAML files in `.github/workflows/**`
  - docs (`README.md`, `AGENTS.md`, module READMEs)
- Create a todo checklist before editing.

### 2) Apply version updates

- For `dagger.json`, set engine to `v${targetVersion}`.
- For npm dependencies, align `@dagger.io/dagger` to `^${targetVersion}` unless local `./sdk` is intentionally used.
- Keep changes minimal and avoid unrelated refactors.

### 3) Regenerate module SDKs (when applicable)

If a module depends on `@dagger.io/dagger: "./sdk"`, run SDK/codegen refresh in that module directory.

- Run `dagger develop` in each affected module.
- If required by module setup, run `npm install` or `yarn install` first.

### 4) Execute validations (mandatory)

Run these commands and capture results.

#### Root validations

- `npm run build`
- `dagger functions`

#### Nested module validations

For each targeted module directory containing `dagger.json`:

- `dagger functions`
- If module has build script: run build command (`npm run build` / equivalent)

#### Optional smoke calls (`runSmokeCalls=true`)

- Run at least one representative `dagger call` per updated module.
- Prefer non-destructive function calls.

### 4.1) Breaking-change verification (mandatory)

After code updates, verify each identified breaking change has one explicit outcome:

- **Mitigated in code** (with file reference), or
- **Not applicable** (with reason), or
- **Blocked** (with concrete follow-up)

Do not mark the upgrade complete without this section.

### 5) Post-check audit

- Confirm no stale versions remain:
  - old target pins in `dagger.json`
  - legacy references in docs/examples
- Use one summary table with:
  - file changed
  - old value
  - new value

### 6) Final response format

Provide:

1. **Upstream release findings**

- latest release
- target release
- breaking changes summary

2. **What changed** (files + old/new versions)
3. **Commands executed** (exact commands)
4. **Validation results** (pass/fail)
5. **Breaking-change verification matrix**
6. **Any blockers or follow-ups**

## Guardrails

- Do not skip command execution; if a command cannot run, state why and propose a concrete alternative.
- Do not claim success without command output.
- Do not change unrelated package versions.
- Keep module architecture and cache conventions intact.
