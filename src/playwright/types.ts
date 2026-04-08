import { Secret } from "@dagger.io/dagger";

export type PlaywrightTestOptions = {
  nodeAuthToken?: Secret;
  packagePaths?: string;
  testSelector?: string;
  testScript?: string;
  runBuild?: boolean;
  registryScope?: string;
  browsers?: string;
  runAffected?: boolean;
  base?: string;
  listOnly?: boolean;
  changedFiles?: string;
  skipReferenceChecks?: boolean;
};
