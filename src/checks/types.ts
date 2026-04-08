import type { PathInput } from "../shared/types.js";

export type NodeChecksOptions = {
  packagePaths?: PathInput;
  build?: boolean;
  test?: boolean;
  lint?: boolean;
  format?: boolean;
  verifyChromiumBidi?: boolean;
  registryScope?: string;
};

import { File } from "@dagger.io/dagger";

export type RegionEnforcementOptions = {
  /** Optional GitHub event JSON file containing PR context. */
  eventFile?: File;
  /** Size threshold in lines to define a file as "non-trivial" (Phase 1 rule 1). */
  threshold?: number;
  /** File extensions to check (e.g., .ts, .js, .css). */
  extensions?: string[];
  /** Patterns to ignore. */
  ignore?: string[];
  /** Custom base branch for diffing. */
  base?: string;
};

export type RegionConfig = {
  threshold: number;
  extensions: Record<string, RegionPattern>;
  ignore: string[];
};

export type RegionPattern = {
  start: string;
  end: string;
};
