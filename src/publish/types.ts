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
   * Credential for the package registry, when it must differ from githubToken.
   *
   * A GitHub App installation token cannot write an organization package
   * without a per-package grant -- npm returns
   * "installation not allowed to Write organization package". A repository
   * Actions token with packages: write can, which is what the retired
   * publish-release job used successfully. So git and pull request work uses
   * the app token while the registry uses this one. Falls back to githubToken.
   */
  npmToken?: Secret;

  /**
   * Issue type for the release tracking issue. Must exist in the organisation.
   */
  releaseIssueType?: string;

  /**
   * Priority for the release tracking issue.
   */
  releaseIssuePriority?: string;

  /**
   * Organisation issue-field id for Priority. It is an org-level custom field
   * rather than an issue attribute, so it needs a separate API call.
   */
  priorityFieldId?: number;

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

  /**
   * Commit the version bump straight onto the base branch instead of opening a
   * release pull request.
   *
   * The pull-request path needs a human every hour: a release touches
   * package.json, CODEOWNERS assigns `*.json` to a team, and a GitHub App can
   * never satisfy `require_code_owner_review` because apps cannot be code
   * owners. Granting the app a ruleset bypass did not help either -- auto-merge
   * evaluates the requirements as written. Pushing directly avoids the question
   * rather than trying to route around it, and lets code-owner review stay fully
   * enforced on every *other* pull request.
   *
   * Only safe because the push is gated on the base branch's own required
   * checks and made conditional on its head sha. See `readBranchGreenState` and
   * `commitOnBranch`.
   */
  directPush?: boolean;
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
   * The caller renders this rather than inferring intent from which fields are
   * set.
   *
   * The first four belong to the pull-request path. The rest belong to the
   * direct-push path:
   *
   * - `pushed` -- the version bump is on the base branch; publish takes over.
   * - `skipped-not-green` -- the base branch did not pass its required checks,
   *   so nothing was written. Fail-closed by design.
   * - `skipped-branch-moved` -- something landed between reading the branch and
   *   committing, so the conditional write was rejected. Next run picks it up.
   * - `repair-dispatched` -- the manifest was bumped previously but the tag
   *   never appeared. Publish was dispatched for the *current* version rather
   *   than bumping past it, which would strand that version permanently.
   */
  outcome:
    | "skipped-in-flight"
    | "nothing-to-release"
    | "dry-run"
    | "opened"
    | "pushed"
    | "skipped-not-green"
    | "skipped-branch-moved"
    | "repair-dispatched";
  reason: string;
  prUrl?: string;
  branch?: string;
  commitSha?: string;
  autoMergeRequested: boolean;
  /**
   * Whether auto-merge was actually enabled. False when the repository has
   * allow_auto_merge disabled, in which case the release is still correct and
   * simply needs a manual merge.
   */
  autoMergeEnabled?: boolean;
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
