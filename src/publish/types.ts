import { Directory, Secret } from "@dagger.io/dagger";

export type ReleasePackageAction =
  | "sync-pr-version"
  | "publish"
  | "prepare-hourly-release"
  | "hourly-release"
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

  /**
   * Compute the release and stop. Nothing is branched, committed, or merged.
   */
  dryRun?: boolean;

  /**
   * Ask GitHub to merge the release pull request once required checks pass.
   */
  autoMerge?: boolean;

  /**
   * Age at which an unmerged release pull request is treated as stalled.
   *
   * The in-flight guard exits successfully by design, so without this a single
   * failing check halts releases indefinitely while every run still reports
   * success.
   */
  stalePrHours?: number;
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

export interface HourlyReleaseResult {
  action: "hourly-release";
  packageName: string;
  currentVersion: string;
  nextVersion: string;
  tagName: string;
  /**
   * skipped-in-flight, nothing-to-release, dry-run, or opened. The caller
   * renders this rather than inferring intent from which fields are set.
   */
  outcome:
    | "skipped-in-flight"
    | "nothing-to-release"
    | "dry-run"
    | "opened";
  reason: string;
  prUrl?: string;
  branch?: string;
  commitSha?: string;
  autoMergeRequested: boolean;
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
  | HourlyReleaseResult
  | GithubOnlyReleaseResult;
