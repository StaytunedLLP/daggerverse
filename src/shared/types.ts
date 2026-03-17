export type PathInput = string | string[];

export type BaseContainerOptions = {
  image?: string;
  workspace?: string;
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
  packagePaths?: PathInput;
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
};
