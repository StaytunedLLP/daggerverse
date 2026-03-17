import type { PathInput } from "../shared/types.js";

export type CopilotWorkspaceOptions = {
  packagePaths?: PathInput;
  playwrightInstall?: boolean;
  firebaseTools?: boolean;
  registryScope?: string;
};
