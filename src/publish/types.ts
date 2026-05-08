import { Directory, Secret } from "@dagger.io/dagger";

export type ReleasePackageAction = "sync-pr-version" | "publish";

export interface ReleasePackageOptions {
  /**
   * Action to run within the release pipeline.
   */
  action: ReleasePackageAction;

  /**
   * Repository source directory to operate on.
   */
  source: Directory;

  /**
   * GitHub token used for repository reads and package registry access.
   */
  githubToken: Secret;

  /**
   * Repository owner (for example, StaytunedLLP).
   */
  repoOwner: string;

  /**
   * Repository name (for example, daggerverse).
   */
  repoName: string;

  /**
   * The organization scope for the npm package.
   * Defaults to extracting it from package.json when available.
   */
  registryScope?: string;

  /**
   * Base branch used as the authoritative version source for PR synchronization.
   * Defaults to main.
   */
  baseBranch?: string;

  /**
   * Repo-relative path to the package folder on the base branch.
   * Defaults to the repository root.
   */
  packagePath?: string;

  /**
   * Pull request branch being synchronized.
   */
  prBranch?: string;
}

export interface PackageManifest {
  name: string;
  version: string;
}

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

export interface SyncPrVersionResult {
  action: "sync-pr-version";
  baseBranch: string;
  prBranch?: string;
  mainVersion: string;
  currentVersion: string;
  newVersion?: string;
  changed: boolean;
  committed?: boolean;
}

export interface PublishPackageResult {
  action: "publish";
  packageName: string;
  publishedVersion: string;
  tagged?: boolean;
}

export type ReleasePackageResult =
  | SyncPrVersionResult
  | PublishPackageResult;
