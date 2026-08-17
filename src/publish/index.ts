import path from "node:path";
import { Directory, Secret, dag } from "@dagger.io/dagger";
import {
  checkRegistryVersion,
  checkReleaseExists,
  checkTagExists,
  commitOnBranch,
  countReleasableCommits,
  dispatchWorkflow,
  createGithubRelease,
  createReleaseBranchWithCommit,
  createReleaseIssue,
  createReleasePr,
  enableAutoMerge,
  findOpenReleasePr,
  ensureFileExistsAtPath,
  extractScope,
  packageFilePath,
  compareVersions,
  nextPatchVersion,
  nextReleaseVersion,
  parseExactVersion,
  parseReleaseBump,
  readBranchGreenState,
  readPackageJsonAtPath,
  readBaseBranchPackageJson,
  validateRegistryScope,
} from "./helpers.js";
import {
  ReleasePackageOptions,
  ReleasePackageResult,
  PublishPackageResult,
  PrepareHourlyReleaseResult,
  HourlyReleaseResult,
  GithubOnlyReleaseResult,
  SyncPrVersionResult,
} from "./types.js";
import {
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "#shared/constants.js";
import { createBaseNodeContainer, withNpmCache } from "#shared/container.js";
import { shellQuote } from "#shared/path-utils.js";
import {
  requirePackageLock,
  withFullSource,
  withInstalledDependencies,
  withLockfilesOnly,
  withNpmAuth,
} from "#shared/npm.js";

const SYNC_WORKSPACE = "/tmp/release-package-sync";
const GIT_REPO_ROOT = "/tmp/release-package-repo";
const GIT_USER_NAME = "github-actions[bot]";
const GIT_USER_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

function serializeResult(result: ReleasePackageResult): string {
  return JSON.stringify(result, null, 2);
}

function resolveRegistryScope(
  packageName: string,
  registryScope?: string,
): string {
  return validateRegistryScope(
    registryScope ?? extractScope(packageName) ?? "staytunedllp",
  );
}

function packageWorkspacePath(packagePath: string): string {
  return packagePath === "."
    ? SYNC_WORKSPACE
    : path.posix.join(SYNC_WORKSPACE, packagePath);
}

function packageRepoPath(packagePath: string): string {
  return packagePath === "."
    ? GIT_REPO_ROOT
    : path.posix.join(GIT_REPO_ROOT, packagePath);
}

async function pushUpdatedPackageFiles(
  source: Directory,
  updatedWorkspace: Directory,
  options: ReleasePackageOptions,
  commitMessage: string,
): Promise<{ commitSha: string }> {
  if (!options.prBranch) {
    throw new Error(
      "prBranch is required when committing the PR version bump.",
    );
  }

  const packagePath = options.packagePath ?? ".";
  const repoPath = packageRepoPath(packagePath);
  const packageJsonPath =
    packagePath === "."
      ? "package.json"
      : path.posix.join(packagePath, "package.json");
  const packageLockPath =
    packagePath === "."
      ? "package-lock.json"
      : path.posix.join(packagePath, "package-lock.json");
  const updatedFilter = {
    include: [packageJsonPath, packageLockPath],
  };

  let container = dag
    .container()
    .from("alpine:latest")
    .withSecretVariable("GH_TOKEN", options.githubToken)
    .withDirectory(GIT_REPO_ROOT, source)
    .withDirectory("/updated", updatedWorkspace.filter(updatedFilter))
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        "apk add --no-cache git github-cli coreutils",
        `cd ${shellQuote(GIT_REPO_ROOT)}`,
        `test -d .git || { echo "Missing git metadata in source checkout." >&2; exit 1; }`,
        `repo_owner=${shellQuote(options.repoOwner)}`,
        `repo_name=${shellQuote(options.repoName)}`,
        `git checkout -B ${shellQuote(options.prBranch)}`,
        `cp ${shellQuote(path.posix.join("/updated", packageJsonPath))} ${shellQuote(path.posix.join(repoPath, "package.json"))}`,
        `cp ${shellQuote(path.posix.join("/updated", packageLockPath))} ${shellQuote(path.posix.join(repoPath, "package-lock.json"))}`,
        `cd ${shellQuote(repoPath)}`,
        `if git diff --quiet -- package.json package-lock.json; then`,
        `  echo "No release files changed, skipping commit."`,
        `  git rev-parse HEAD > /tmp/commit-sha`,
        `  exit 0`,
        `fi`,
        `head_oid=$(git rev-parse HEAD)`,
        `base64 -w 0 package.json > /tmp/p_json_content`,
        `base64 -w 0 package-lock.json > /tmp/p_lock_content`,
        `query='mutation($repositoryNameWithOwner: String!, $branchName: String!, $expectedHeadOid: GitObjectID!, $message: String!, $pJsonPath: String!, $pJsonContent: Base64String!, $pLockPath: String!, $pLockContent: Base64String!) { createCommitOnBranch(input: { branch: { repositoryNameWithOwner: $repositoryNameWithOwner, branchName: $branchName }, message: { headline: $message }, expectedHeadOid: $expectedHeadOid, fileChanges: { additions: [ { path: $pJsonPath, contents: $pJsonContent }, { path: $pLockPath, contents: $pLockContent } ] } }) { commit { oid } } }'`,
        `gh api graphql -f query="$query" -F repositoryNameWithOwner="$repo_owner/$repo_name" -F branchName=${shellQuote(options.prBranch)} -F expectedHeadOid="$head_oid" -F message=${shellQuote(commitMessage)} -F pJsonPath=${shellQuote(packageJsonPath)} -F pJsonContent=@/tmp/p_json_content -F pLockPath=${shellQuote(packageLockPath)} -F pLockContent=@/tmp/p_lock_content --jq '.data.createCommitOnBranch.commit.oid' > /tmp/commit-sha`,
      ].join("\n"),
    ]);

  const commitSha = await container.file("/tmp/commit-sha").contents();
  return { commitSha: commitSha.trim() };
}

async function pushReleaseTag(
  options: ReleasePackageOptions,
  version: string,
): Promise<string> {
  const tagName = `v${version}`;

  await dag
    .container()
    .from("alpine/git:latest")
    .withSecretVariable("GITHUB_TOKEN", options.githubToken)
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `repo_owner=${shellQuote(options.repoOwner)}`,
        `repo_name=${shellQuote(options.repoName)}`,
        `repo_url="https://x-access-token:${"${GITHUB_TOKEN}"}@github.com/$repo_owner/$repo_name.git"`,
        `git clone --branch ${shellQuote(options.baseBranch ?? "main")} --single-branch --depth=1 "$repo_url" ${shellQuote(GIT_REPO_ROOT)}`,
        `cd ${shellQuote(GIT_REPO_ROOT)}`,
        `git config user.name ${shellQuote(GIT_USER_NAME)}`,
        `git config user.email ${shellQuote(GIT_USER_EMAIL)}`,
        `git tag -a ${shellQuote(tagName)} -m ${shellQuote(`Release ${tagName}`)}`,
        `git push origin ${shellQuote(tagName)}`,
      ].join("\n"),
    ])
    .sync();

  return tagName;
}

async function syncPrVersion(
  options: ReleasePackageOptions,
): Promise<SyncPrVersionResult> {
  const baseBranch = options.baseBranch ?? "main";
  const packagePath = options.packagePath ?? ".";
  const mainManifest = await readBaseBranchPackageJson(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    baseBranch,
    packagePath,
  );
  const manifest = await readPackageJsonAtPath(options.source, packagePath);

  await ensureFileExistsAtPath(
    options.source,
    packagePath,
    "package-lock.json",
  );
  parseExactVersion(mainManifest.version);
  parseExactVersion(manifest.version);

  if (compareVersions(manifest.version, mainManifest.version) > 0) {
    return {
      action: "sync-pr-version",
      baseBranch,
      prBranch: options.prBranch,
      mainVersion: mainManifest.version,
      currentVersion: manifest.version,
      changed: false,
      committed: false,
    };
  }

  const newVersion = nextPatchVersion(mainManifest.version);
  let container = createBaseNodeContainer({ workspace: SYNC_WORKSPACE });

  container = withNpmCache(container);
  container = withLockfilesOnly(container, options.source, {
    workspace: SYNC_WORKSPACE,
    packagePaths: packagePath,
  });
  container = requirePackageLock(container, packagePath, {
    workspace: SYNC_WORKSPACE,
  });
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(packageWorkspacePath(packagePath))}`,
      `npm_config_ignore_scripts=true npm version ${shellQuote(newVersion)} --no-git-tag-version`,
    ].join("\n"),
  ]);

  const { commitSha } = await pushUpdatedPackageFiles(
    options.source,
    container.directory(SYNC_WORKSPACE),
    options,
    `chore(release): bump version to v${newVersion}`,
  );

  return {
    action: "sync-pr-version",
    baseBranch,
    prBranch: options.prBranch,
    mainVersion: mainManifest.version,
    currentVersion: manifest.version,
    newVersion,
    changed: true,
    committed: true,
    pushedBranch: options.prBranch,
    commitSha,
  };
}

async function publishRelease(
  options: ReleasePackageOptions,
): Promise<PublishPackageResult> {
  const packagePath = options.packagePath ?? ".";
  const manifest = await readPackageJsonAtPath(options.source, packagePath);
  const registryScope = resolveRegistryScope(
    manifest.name,
    options.registryScope,
  );

  await ensureFileExistsAtPath(
    options.source,
    packagePath,
    "package-lock.json",
  );
  parseExactVersion(manifest.version);

  const tagName = `v${manifest.version}`;

  // The registry needs its own credential -- see ReleasePackageOptions.npmToken.
  const registryToken = options.npmToken ?? options.githubToken;

  // Read all three surfaces before touching any of them. An hourly schedule
  // re-runs against state it may have already produced, and the four
  // combinations below are not equally safe: three are recoverable, one means
  // a human has to look.
  const [inRegistry, tagExists, releaseExists] = await Promise.all([
    checkRegistryVersion(
      manifest.name,
      manifest.version,
      registryToken,
      registryScope,
    ),
    checkTagExists(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      tagName,
    ),
    checkReleaseExists(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      tagName,
    ),
  ]);

  // A tag without the package means a publish died between the two steps.
  // Re-running would push a package under a tag that already names a
  // different tree, so stop and say exactly which surfaces disagree.
  if (tagExists && !inRegistry) {
    throw new Error(
      `Partial release state for "${manifest.name}@${manifest.version}": ` +
        `tag "${tagName}" exists but the package is absent from the registry. ` +
        "Resolve by hand -- either publish the package for that tag or delete " +
        "the tag if the release was abandoned.",
    );
  }

  // Everything already present. Success, not a failure: this is what an
  // unchanged hourly run looks like.
  if (inRegistry && tagExists && releaseExists) {
    return {
      action: "publish",
      packageName: manifest.name,
      publishedVersion: manifest.version,
      tagged: true,
      tagName,
      registryPublished: false,
      releaseCreated: false,
      noop: true,
    };
  }

  // Package and tag exist but the Release is missing -- repair it without
  // republishing. This is the state the workflow's old raw-curl release call
  // left behind whenever it failed after a successful publish.
  if (inRegistry && tagExists && !releaseExists) {
    await createGithubRelease(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      tagName,
    );

    return {
      action: "publish",
      packageName: manifest.name,
      publishedVersion: manifest.version,
      tagged: true,
      tagName,
      registryPublished: false,
      releaseCreated: true,
      noop: false,
    };
  }

  let container = createBaseNodeContainer();

  container = withNpmCache(container);
  container = withLockfilesOnly(container, options.source, {
    packagePaths: packagePath,
  });
  container = withNpmAuth(container, registryToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });
  container = withInstalledDependencies(container, packagePath, {
    workspace: DEFAULT_WORKSPACE,
    npmCiArgs: ["--workspaces=false", "--legacy-peer-deps"],
  });
  // Reapply npm auth after copying the full source in case the repository ships its own .npmrc.
  container = withFullSource(container, options.source, {
    exclude: DEFAULT_SOURCE_EXCLUDES,
  });
  container = requirePackageLock(container, packagePath);
  container = withNpmAuth(container, registryToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `package_dir=${shellQuote(path.posix.join(DEFAULT_WORKSPACE, packagePath))}`,
      'mkdir -p "$package_dir"',
      "cat > \"$package_dir/.npmrc\" <<'EOF'",
      "registry=https://npm.pkg.github.com",
      `@${registryScope}:registry=https://npm.pkg.github.com`,
      "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
      "always-auth=true",
      "EOF",
    ].join("\n"),
  ]);
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(path.posix.join(DEFAULT_WORKSPACE, packagePath))}`,
      "npm publish --registry=https://npm.pkg.github.com --tag latest",
    ].join("\n"),
  ]);

  await container.sync();

  // tagExists is false here: the only path that reaches this point with a tag
  // already present threw above as a partial state.
  await pushReleaseTag(options, manifest.version);
  await createGithubRelease(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    tagName,
  );

  return {
    action: "publish",
    packageName: manifest.name,
    publishedVersion: manifest.version,
    tagged: true,
    tagName,
    registryPublished: true,
    releaseCreated: true,
    noop: false,
  };
}

/**
 * Computes the next release without touching anything remote.
 *
 * Deliberately side-effect free: it returns the version and the manifest
 * content to commit, and the caller creates the pull request. Keeping the
 * mutation in the workflow means a dry run is genuinely dry, and it keeps this
 * function cheap enough to call on an hourly schedule that mostly finds
 * nothing to do.
 */
async function prepareHourlyRelease(
  options: ReleasePackageOptions,
): Promise<PrepareHourlyReleaseResult> {
  const packagePath = options.packagePath ?? ".";
  const manifest = await readPackageJsonAtPath(options.source, packagePath);

  // Reject a non-exact version before computing anything from it. A range or
  // prerelease here would produce a nonsense tag.
  parseExactVersion(manifest.version);
  await ensureFileExistsAtPath(
    options.source,
    packagePath,
    "package-lock.json",
  );

  const nextVersion = nextPatchVersion(manifest.version);
  const tagName = `v${nextVersion}`;

  // Guard one: the tag this run would produce already exists. That is the
  // repair case -- a release was cut but the manifest never moved -- not the
  // ordinary one.
  const alreadyReleased = await checkTagExists(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    tagName,
  );

  if (alreadyReleased) {
    return {
      action: "prepare-hourly-release",
      packageName: manifest.name,
      currentVersion: manifest.version,
      nextVersion,
      tagName,
      releaseNeeded: false,
      reason: `Tag ${tagName} already exists; nothing to release.`,
    };
  }

  // Guard two, and the one that actually decides most hours: has anything
  // landed since the last release?
  //
  // This used to be inferred from the absence of the *next* tag, which is a
  // question whose answer is almost always no -- so every hour looked like it
  // had work, and produced a release whose only content was its own version
  // bump. daggerverse v1.12.2 contained exactly one commit: the commit that
  // created it. Each of those also spends a full check run on a runner pool
  // that is not keeping up as it is.
  const currentTag = `v${manifest.version}`;
  const releasableCommits = await countReleasableCommits(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    currentTag,
    options.baseBranch ?? "main",
  );

  // null means the comparison could not be made -- no previous tag, or an
  // unreadable response. Release in that case: refusing on a failed lookup
  // would stall the train silently, which is the worse of the two mistakes.
  if (releasableCommits === 0) {
    return {
      action: "prepare-hourly-release",
      packageName: manifest.name,
      currentVersion: manifest.version,
      nextVersion,
      tagName,
      releaseNeeded: false,
      reason: `No commits on ${options.baseBranch ?? "main"} since ${currentTag}; nothing to release.`,
    };
  }

  const manifestFile = packageFilePath(packagePath, "package.json");
  const lockFile = packageFilePath(packagePath, "package-lock.json");

  const manifestJson = JSON.parse(
    await options.source.file(manifestFile).contents(),
  );
  manifestJson.version = nextVersion;

  const lockJson = JSON.parse(await options.source.file(lockFile).contents());

  // Update the version only where npm already wrote one -- see hourlyRelease
  // for why. gonow.travel's lockfile has it in neither place.
  if (typeof lockJson.version === "string") {
    lockJson.version = nextVersion;
  }
  if (typeof lockJson.packages?.[""]?.version === "string") {
    lockJson.packages[""].version = nextVersion;
  }

  return {
    action: "prepare-hourly-release",
    packageName: manifest.name,
    currentVersion: manifest.version,
    nextVersion,
    tagName,
    releaseNeeded: true,
    reason: `Next patch release ${nextVersion}.`,
    manifestContent: `${JSON.stringify(manifestJson, null, 2)}\n`,
    lockfileContent: `${JSON.stringify(lockJson, null, 2)}\n`,
  };
}

const RELEASE_BRANCH_PREFIX = "release/hourly-";

/**
 * Publish workflow file name, used to repair a manifest that moved without its
 * tag. Identical across all five repositories.
 */
const PUBLISH_WORKFLOW_FILE = "release-publish.yml";

/**
 * The whole hourly cycle, in containers.
 *
 * This deliberately lives in the module rather than in workflow shell. The
 * shared runners carry no `gh` and no `jq` -- a first attempt at driving this
 * from workflow steps died with `gh: command not found` -- and every host tool
 * a workflow depends on is another thing that can differ between runners. Here
 * the runner needs Docker and nothing else, and the flow can be exercised
 * locally with `dagger call`.
 */
async function hourlyRelease(
  options: ReleasePackageOptions,
): Promise<HourlyReleaseResult> {
  const packagePath = options.packagePath ?? ".";
  const baseBranch = options.baseBranch ?? "main";
  const staleHours = options.stalePrHours ?? 6;
  const manifest = await readPackageJsonAtPath(options.source, packagePath);

  parseExactVersion(manifest.version);
  await ensureFileExistsAtPath(
    options.source,
    packagePath,
    "package-lock.json",
  );

  const bump = parseReleaseBump(options.bump);
  const nextVersion = nextReleaseVersion(manifest.version, bump);
  const tagName = `v${nextVersion}`;

  const base = {
    action: "hourly-release" as const,
    packageName: manifest.name,
    currentVersion: manifest.version,
    nextVersion,
    tagName,
    autoMergeRequested: options.autoMerge ?? true,
  };

  // Repair before anything else: the manifest moved but the tag never appeared.
  //
  // Bumping again here would strand that version permanently. The next run
  // would compute the version after it, and the missing one could never be
  // built from any commit -- the manifest has already moved past it. Worse, the
  // "anything to release?" guard below compares against `v{currentVersion}`,
  // and comparing against a tag that does not exist reads as "cannot tell",
  // which releases. So the two failures compound: the bump is skipped *and* the
  // guard stops guarding.
  //
  // This is not hypothetical. staylook reached manifest 1.3.40 with no v1.3.40
  // tag, because its release workflows were archived between the bump and the
  // publish.
  //
  // Publish reads the version from the manifest, so dispatching it releases the
  // version already on the branch instead of moving past it. Idempotent: it
  // checks tag, Release and registry before touching any of them.
  const currentTag = `v${manifest.version}`;
  const currentTagExists = await checkTagExists(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    currentTag,
  );

  if (!currentTagExists) {
    // A dry run must not dispatch. Reporting the repair is the whole point of a
    // dry run; performing it is exactly what the caller asked not to happen.
    if (options.dryRun) {
      return {
        ...base,
        outcome: "repair-dispatched",
        reason: `Manifest is at ${manifest.version} but ${currentTag} does not exist: a previous run bumped without publishing. Would dispatch ${PUBLISH_WORKFLOW_FILE} to release ${currentTag}.`,
      };
    }

    const dispatched = await dispatchWorkflow(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      PUBLISH_WORKFLOW_FILE,
      baseBranch,
    );
    return {
      ...base,
      outcome: "repair-dispatched",
      reason:
        `Manifest is at ${manifest.version} but ${currentTag} does not exist: a previous run bumped without publishing. ` +
        (dispatched
          ? `Dispatched ${PUBLISH_WORKFLOW_FILE} to release ${currentTag} rather than bumping past it.`
          : `Could not dispatch ${PUBLISH_WORKFLOW_FILE}; release ${currentTag} by hand before the next run.`),
    };
  }

  // A release already in flight. Exiting successfully is correct -- but only
  // while it is progressing, so an old one becomes a hard failure rather than a
  // silent halt.
  // Direct-push never opens a PR, so there is nothing in flight to wait on.
  const inFlight = options.directPush
    ? null
    : await findOpenReleasePr(
        options.githubToken,
        options.repoOwner,
        options.repoName,
        RELEASE_BRANCH_PREFIX,
      );

  if (inFlight) {
    if (inFlight.ageHours >= staleHours) {
      throw new Error(
        `Release pull request #${inFlight.number} has been open ${inFlight.ageHours}h ` +
          `(threshold ${staleHours}h): ${inFlight.url}. ` +
          "Releases are halted until it merges or is closed.",
      );
    }

    return {
      ...base,
      outcome: "skipped-in-flight",
      reason: `Release PR #${inFlight.number} is awaiting checks (${inFlight.ageHours}h old).`,
      prUrl: inFlight.url,
    };
  }

  // The tag this run would produce already exists, so the previous release
  // landed and nothing has been merged since. The common case on an hourly
  // schedule.
  const alreadyReleased = await checkTagExists(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    tagName,
  );

  if (alreadyReleased) {
    return {
      ...base,
      outcome: "nothing-to-release",
      reason: `Tag ${tagName} already exists; nothing to release.`,
    };
  }

  // Guard two, and the one that decides most hours: has anything actually
  // landed since the last release?
  //
  // Guard one asks whether the *next* tag exists, a question whose answer is
  // almost always no -- so every hour looked like it had work and produced a
  // release whose only content was its own version bump. #209 was exactly
  // that: one commit, the bump that created it.
  //
  // This same guard sat in prepareHourlyRelease across three attempted fixes
  // and never executed once, because every workflow passes
  // --action=hourly-release, which lands here instead. A guard in a function
  // nothing calls is indistinguishable from no guard at all -- and it reads as
  // fixed, which is worse.
  //
  // currentTag was resolved above, where its absence is handled as a repair --
  // which also protects this call, since comparing against a tag that does not
  // exist returns null and null means "release".
  const releasableCommits = await countReleasableCommits(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    currentTag,
    baseBranch,
  );

  // null means the comparison could not be made -- no previous tag, or an
  // unreadable response. Release in that case: refusing on a failed lookup
  // would stall the train silently, which is the worse of the two mistakes.
  if (releasableCommits === 0) {
    return {
      ...base,
      outcome: "nothing-to-release",
      reason: `No commits on ${baseBranch} since ${currentTag}; nothing to release.`,
    };
  }

  const manifestFile = packageFilePath(packagePath, "package.json");
  const lockFile = packageFilePath(packagePath, "package-lock.json");

  const manifestJson = JSON.parse(
    await options.source.file(manifestFile).contents(),
  );
  manifestJson.version = nextVersion;

  const lockJson = JSON.parse(await options.source.file(lockFile).contents());

  // Update the version only where npm already wrote one. A private application
  // whose manifest carries no version has a lockfile with none either
  // (gonow.travel is shaped exactly this way), and injecting the key would
  // produce a lockfile npm never generated. Where both copies exist they must
  // move together, because a mismatch makes `npm ci` refuse to install.
  if (typeof lockJson.version === "string") {
    lockJson.version = nextVersion;
  }
  if (typeof lockJson.packages?.[""]?.version === "string") {
    lockJson.packages[""].version = nextVersion;
  }

  const greenState = options.directPush
    ? await readBranchGreenState(
        options.githubToken,
        options.repoOwner,
        options.repoName,
        baseBranch,
      )
    : null;

  if (options.dryRun) {
    if (greenState) {
      return {
        ...base,
        outcome: "dry-run",
        reason: greenState.green
          ? `Would commit ${nextVersion} to ${baseBranch}@${greenState.sha.slice(0, 8)} (${greenState.reason})`
          : `Would refuse: ${baseBranch} is not releasable -- ${greenState.reason}`,
      };
    }
    return {
      ...base,
      outcome: "dry-run",
      reason: `Would release ${nextVersion}.`,
    };
  }

  const manifestFiles = [
    {
      path: manifestFile,
      contents: `${JSON.stringify(manifestJson, null, 2)}\n`,
    },
    { path: lockFile, contents: `${JSON.stringify(lockJson, null, 2)}\n` },
  ];
  const releaseMessage = `chore(release): hourly v${nextVersion}`;

  if (options.directPush && greenState) {
    if (!greenState.green) {
      return {
        ...base,
        outcome: "skipped-not-green",
        reason: `${baseBranch} is not releasable: ${greenState.reason} Nothing was written.`,
      };
    }

    const pushedSha = await commitOnBranch(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      baseBranch,
      greenState.sha,
      releaseMessage,
      manifestFiles,
    );

    if (!pushedSha) {
      return {
        ...base,
        outcome: "skipped-branch-moved",
        reason: `${baseBranch} moved from ${greenState.sha.slice(0, 8)} while this run was checking it, so the commit was refused. The next run will retry.`,
      };
    }

    return {
      ...base,
      outcome: "pushed",
      branch: baseBranch,
      commitSha: pushedSha,
      reason: `Committed ${nextVersion} to ${baseBranch} (${greenState.reason}) as ${pushedSha.slice(0, 8)}; publish takes over from the push.`,
    };
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 10);
  const branch = `${RELEASE_BRANCH_PREFIX}${stamp}`;

  const commitSha = await createReleaseBranchWithCommit(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    branch,
    baseBranch,
    releaseMessage,
    manifestFiles,
  );

  // The organisation's policy checks all evaluate against a linked issue, so a
  // release pull request needs one or it can never merge. Created before the
  // pull request so the body can reference it.
  const issueNumber = await createReleaseIssue(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    nextVersion,
    options.releaseIssueType ?? "Task 📀",
    options.releaseIssuePriority ?? "P3",
    options.priorityFieldId ?? 3129,
  );

  const prUrl = await createReleasePr(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    branch,
    baseBranch,
    releaseMessage,
    [
      "Version-only release prepared by the hourly schedule.",
      "",
      `- Version: \`${nextVersion}\``,
      `- Tag on merge: \`${tagName}\``,
      "",
      `Publishing happens after merge, from the manifest change on \`${baseBranch}\`.`,
      "",
      `Closes #${issueNumber}`,
    ].join("\n"),
  );

  let autoMergeEnabled = false;
  if (base.autoMergeRequested) {
    autoMergeEnabled = await enableAutoMerge(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      prUrl,
    );
  }

  return {
    ...base,
    outcome: "opened",
    reason:
      base.autoMergeRequested && !autoMergeEnabled
        ? `Opened release pull request for ${nextVersion}. Auto-merge is unavailable in this repository, so it needs a manual merge.`
        : `Opened release pull request for ${nextVersion}.`,
    prUrl,
    branch,
    commitSha,
    autoMergeEnabled,
  };
}

/**
 * Tags and creates a GitHub Release without publishing a package.
 *
 * For repositories whose release artifact is not a package: a private
 * application, or a Dagger module where the public git tag is itself the
 * distribution mechanism and no publish command exists.
 */
async function githubOnlyRelease(
  options: ReleasePackageOptions,
): Promise<GithubOnlyReleaseResult> {
  const packagePath = options.packagePath ?? ".";
  const manifest = await readPackageJsonAtPath(options.source, packagePath);

  parseExactVersion(manifest.version);

  const tagName = `v${manifest.version}`;

  const [tagExists, releaseExists] = await Promise.all([
    checkTagExists(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      tagName,
    ),
    checkReleaseExists(
      options.githubToken,
      options.repoOwner,
      options.repoName,
      tagName,
    ),
  ]);

  if (tagExists && releaseExists) {
    return {
      action: "github-only",
      version: manifest.version,
      tagName,
      tagCreated: false,
      releaseCreated: false,
      noop: true,
    };
  }

  if (!tagExists) {
    await pushReleaseTag(options, manifest.version);
  }

  // Reached when the tag existed but its Release did not -- the repair case.
  await createGithubRelease(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    tagName,
  );

  return {
    action: "github-only",
    version: manifest.version,
    tagName,
    tagCreated: !tagExists,
    releaseCreated: true,
    noop: false,
  };
}

/**
 * Production release pipeline.
 *
 * `prepare-hourly-release` computes and returns; `publish` and `github-only`
 * mutate remote state and are idempotent, so an hourly schedule can re-run
 * them safely.
 */
/**
 * The only organisation this module may release for.
 *
 * Every action here creates tags, GitHub Releases and registry packages using
 * repoOwner, which arrives as a plain string from the caller's workflow --
 * `github.repository_owner`. That is trustworthy in this organisation's own
 * workflows and is not trustworthy in general: a fork, a copied workflow, or a
 * mistyped input would point the whole release machinery, holding a token that
 * can write tags and packages, at a repository nobody intended.
 *
 * Refusing anything else costs nothing here and makes the blast radius of a
 * wrong owner a failed run rather than a release somewhere else.
 */
const ALLOWED_REPO_OWNER = "StaytunedLLP";

export async function releasePackage(
  options: ReleasePackageOptions,
): Promise<string> {
  // Checked once, at the single entry point every action passes through,
  // rather than in each of them.
  if (options.repoOwner !== ALLOWED_REPO_OWNER) {
    throw new Error(
      `Refusing to release for owner "${options.repoOwner}": this module only releases for ${ALLOWED_REPO_OWNER}. ` +
        "If the organisation has genuinely changed, change ALLOWED_REPO_OWNER deliberately rather than passing a different value.",
    );
  }

  let result: ReleasePackageResult;

  switch (options.action) {
    case "sync-pr-version":
      result = await syncPrVersion(options);
      break;
    case "prepare-hourly-release":
      result = await prepareHourlyRelease(options);
      break;
    case "hourly-release":
      result = await hourlyRelease(options);
      break;
    case "github-only":
      result = await githubOnlyRelease(options);
      break;
    case "publish":
      result = await publishRelease(options);
      break;
    default:
      // An unknown action used to fall through to publish, which is the most
      // destructive branch. Fail instead.
      throw new Error(
        `Unknown release action "${options.action}". Expected one of: ` +
          "sync-pr-version, prepare-hourly-release, hourly-release, publish, github-only.",
      );
  }

  return serializeResult(result);
}
