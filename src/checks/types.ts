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
};
