export const DEFAULT_IMAGE = "node:24-bookworm";
export const DEFAULT_WORKSPACE = "/workspace";
export const DEFAULT_NPM_CACHE = "npm-cache-node24";
export const DEFAULT_PLAYWRIGHT_CACHE = "playwright-cache-node24";
export const DEFAULT_NPM_CACHE_PATH = "/root/.npm";
export const DEFAULT_PLAYWRIGHT_CACHE_PATH = "/root/.cache/ms-playwright";
export const DEFAULT_REGISTRY_SCOPE = "staytunedllp";
/** Node heap ceiling in MiB, assuming one check runs at a time. */
export const DEFAULT_NODE_MAX_OLD_SPACE_MB = 4096;
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
