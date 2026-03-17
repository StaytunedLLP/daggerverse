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
