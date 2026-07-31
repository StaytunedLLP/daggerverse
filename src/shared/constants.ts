export const DEFAULT_IMAGE = "node:24-bookworm";
export const DEFAULT_WORKSPACE = "/workspace";
export const DEFAULT_NPM_CACHE = "npm-cache-node24";
export const DEFAULT_PLAYWRIGHT_CACHE = "playwright-cache-node24";
export const DEFAULT_NPM_CACHE_PATH = "/root/.npm";
export const DEFAULT_PLAYWRIGHT_CACHE_PATH = "/root/.cache/ms-playwright";
export const DEFAULT_REGISTRY_SCOPE = "staytunedllp";
/**
 * Node heap ceiling in MiB.
 *
 * 4096 was chosen assuming one check runs at a time, and that assumption is why
 * the checks are serial: four concurrent Node processes each believing they may
 * take 4 GiB will exhaust any of these hosts, which have 7.7 GiB total, four
 * cores, and a Dagger engine holding roughly 2.4 GiB of it.
 *
 * Measured instead: the Node processes inside the check containers peaked around
 * 650 MB. The ceiling was six times the observed need, and that headroom is what
 * allowed three concurrent jobs to OOM-kill each other -- one such kill
 * cancelled a run after 14 minutes with no diagnostic, because a signal death
 * was being reported as a plain exit 1.
 *
 * 1536 leaves better than double the measured peak. It is deliberately not
 * tuned to the peak: a heap ceiling that is too low trades an OOM kill for heap
 * exhaustion inside tsc or eslint, which fails less legibly. If a specific check
 * needs more, raise it for that check via nodeMaxOldSpaceMb rather than lifting
 * this again.
 */
export const DEFAULT_NODE_MAX_OLD_SPACE_MB = 1536;
export const DEFAULT_PLAYWRIGHT_BROWSERS = ["chromium"];
export const STRICT_SHELL_HEADER = "set -euo pipefail";
export const DEFAULT_SOURCE_EXCLUDES = [
  ".git",
  "dagger",
  "dist",
  "node_modules",
];

/**
 * Source excludes for incremental ("affected") runs.
 *
 * Keeps `.git` in the container: incremental scripts (`verify:incremental`,
 * `test:incremental`, `staystack staytest --incremental`) resolve the changed
 * set with `git diff <base>...HEAD`. Without a repository they silently see an
 * empty diff and select nothing, which makes every incremental check a no-op.
 */
export const AFFECTED_SOURCE_EXCLUDES = [
  "dagger",
  "dist",
  "node_modules",
];
