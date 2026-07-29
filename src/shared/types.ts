export type PathInput = string | string[];

export type BaseContainerOptions = {
  image?: string;
  workspace?: string;
  /**
   * Node heap ceiling in MiB. Defaults to DEFAULT_NODE_MAX_OLD_SPACE_MB.
   *
   * Size this against the runner, and against how many checks may run at
   * once: the default assumes one check at a time. Four concurrent checks
   * each claiming 4096 MiB starved a 4 GiB runner until it dropped off the
   * network (staydevops run 30415009187).
   */
  nodeMaxOldSpaceMb?: number;
};

export type CacheOptions = {
  cacheVolume?: string;
};

export type NpmAuthOptions = {
  registryScope?: string;
  npmrcPaths?: PathInput;
  workspace?: string;
};

export type LockfileOptions = {
  workspace?: string;
  packagePaths?: PathInput;
};

export type InstallOptions = {
  workspace?: string;
  npmCiArgs?: string[];
};

export type SourceOptions = {
  workspace?: string;
  exclude?: string[];
  strategy?: "replace" | "overlay";
};

export type PlaywrightOptions = {
  cwd?: string;
  workspace?: string;
  browsers?: string[];
};

export type RunScriptOptions = {
  cwd?: string;
  workspace?: string;
  args?: string[];
};

export type NodeWorkspaceOptions = {
  packagePaths?: PathInput;
  registryScope?: string;
  npmrcPaths?: PathInput;
  workspace?: string;
  withPlaywrightCache?: boolean;
  npmCiArgs?: string[];
  nodeMaxOldSpaceMb?: number;
};
