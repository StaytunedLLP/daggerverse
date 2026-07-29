import { Directory, Secret } from "@dagger.io/dagger";

export type ReleasePackageAction =
  | "sync-pr-version"
  | "publish"
  | "prepare-hourly-release"
  | "github-only";

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
  committed: boolean;
  pushedBranch?: string;
  commitSha?: string;
}

export interface PublishPackageResult {
  action: "publish";
  packageName: string;
  publishedVersion: string;
  tagged: boolean;
  tagName?: string;
  /**
   * What each surface required. An hourly job re-runs against state it may
   * have already produced, so the caller needs to distinguish "did the work"
   * from "found it already done" -- both are success.
   */
  registryPublished: boolean;
  releaseCreated: boolean;
  noop: boolean;
}

export interface PrepareHourlyReleaseResult {
  action: "prepare-hourly-release";
  packageName: string;
  currentVersion: string;
  nextVersion: string;
  tagName: string;
  /**
   * False when nothing has landed since the last tag, which is the common
   * case for an hourly schedule and must exit successfully rather than open
   * an empty release pull request.
   */
  releaseNeeded: boolean;
  reason: string;
  /**
   * The manifest content the caller should commit. Returned rather than
   * written so this action stays free of remote side effects.
   */
  manifestContent?: string;
  lockfileContent?: string;
}

export interface GithubOnlyReleaseResult {
  action: "github-only";
  version: string;
  tagName: string;
  tagCreated: boolean;
  releaseCreated: boolean;
  noop: boolean;
}

export type ReleasePackageResult =
  | SyncPrVersionResult
  | PublishPackageResult
  | PrepareHourlyReleaseResult
  | GithubOnlyReleaseResult;
