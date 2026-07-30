import type { PathInput } from "#shared/types.js";

export type NodeChecksOptions = {
  packagePaths?: PathInput;
  build?: boolean;
  test?: boolean;
  lint?: boolean;
  format?: boolean;
  profile?: "pr" | "main" | "nightly" | "full";
  verifyChromiumBidi?: boolean;
  registryScope?: string;
  runAffected?: boolean;
  testScript?: string;
  base?: string;
  changedFiles?: string;
  nodeMaxOldSpaceMb?: number;

  /**
   * Whether an affected run expands the changed set through the reverse
   * dependency graph. Defaults to true, which is pr and main behaviour.
   *
   * Set false for the local profile, which reports only the packages whose own
   * files changed. Ignored when runAffected is false -- a full run has no
   * changed set to expand.
   */
  includeDependents?: boolean;
};
