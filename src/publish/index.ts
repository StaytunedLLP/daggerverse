import path from "node:path";
import { Directory, Secret, dag } from "@dagger.io/dagger";
import {
  checkRegistryVersion,
  ensureFileExistsAtPath,
  extractScope,
  compareVersions,
  nextPatchVersion,
  parseExactVersion,
  readPackageJsonAtPath,
  readBaseBranchPackageJson,
  validateRegistryScope,
} from "./helpers.js";
import {
  ReleasePackageOptions,
  ReleasePackageResult,
  PublishPackageResult,
  SyncPrVersionResult,
} from "./types.js";
import {
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "../shared/constants.js";
import { createBaseNodeContainer, withNpmCache } from "../shared/container.js";
import { shellQuote } from "../shared/path-utils.js";
import {
  requirePackageLock,
  withFullSource,
  withInstalledDependencies,
  withLockfilesOnly,
  withNpmAuth,
} from "../shared/npm.js";

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
  return packagePath === "." ? SYNC_WORKSPACE : path.posix.join(SYNC_WORKSPACE, packagePath);
}

function packageRepoPath(packagePath: string): string {
  return packagePath === "." ? GIT_REPO_ROOT : path.posix.join(GIT_REPO_ROOT, packagePath);
}

async function pushUpdatedPackageFiles(
  source: Directory,
  updatedWorkspace: Directory,
  options: ReleasePackageOptions,
  commitMessage: string,
): Promise<{ commitSha: string }> {
  if (!options.prBranch) {
    throw new Error("prBranch is required when committing the PR version bump.");
  }

  const packagePath = options.packagePath ?? ".";
  const repoPath = packageRepoPath(packagePath);
  const packageJsonPath = packagePath === "."
    ? "package.json"
    : path.posix.join(packagePath, "package.json");
  const packageLockPath = packagePath === "."
    ? "package-lock.json"
    : path.posix.join(packagePath, "package-lock.json");
  const updatedFilter = {
    include: [packageJsonPath, packageLockPath],
  };

  let container = dag
    .container()
    .from("alpine/git:latest")
    .withSecretVariable("GITHUB_TOKEN", options.githubToken)
    .withDirectory(GIT_REPO_ROOT, source)
    .withDirectory("/updated", updatedWorkspace.filter(updatedFilter))
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `cd ${shellQuote(GIT_REPO_ROOT)}`,
        `test -d .git || { echo "Missing git metadata in source checkout." >&2; exit 1; }`,
        `repo_owner=${shellQuote(options.repoOwner)}`,
        `repo_name=${shellQuote(options.repoName)}`,
        `repo_url="https://x-access-token:$GITHUB_TOKEN@github.com/$repo_owner/$repo_name.git"`,
        `git remote set-url origin "$repo_url"`,
        `git checkout -B ${shellQuote(options.prBranch)}`,
        `cp ${shellQuote(path.posix.join("/updated", packageJsonPath))} ${shellQuote(path.posix.join(repoPath, "package.json"))}`,
        `cp ${shellQuote(path.posix.join("/updated", packageLockPath))} ${shellQuote(path.posix.join(repoPath, "package-lock.json"))}`,
        `cd ${shellQuote(repoPath)}`,
        `if git diff --quiet -- package.json package-lock.json; then`,
        `  echo "No release files changed, skipping commit."`,
        `  git rev-parse HEAD > /tmp/commit-sha`,
        `  exit 0`,
        `fi`,
        `git config user.name ${shellQuote(GIT_USER_NAME)}`,
        `git config user.email ${shellQuote(GIT_USER_EMAIL)}`,
        `git add package.json package-lock.json`,
        `git commit -m ${shellQuote(commitMessage)}`,
        `git push origin HEAD:${shellQuote(options.prBranch)}`,
        `git rev-parse HEAD > /tmp/commit-sha`,
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

  await ensureFileExistsAtPath(options.source, packagePath, "package-lock.json");
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
  container = requirePackageLock(container, packagePath, { workspace: SYNC_WORKSPACE });
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

  await ensureFileExistsAtPath(options.source, packagePath, "package-lock.json");
  parseExactVersion(manifest.version);

  if (
    await checkRegistryVersion(
      manifest.name,
      manifest.version,
      options.githubToken,
      registryScope,
    )
  ) {
    throw new Error(
      `Version "${manifest.version}" of package "${manifest.name}" already exists in the registry.`,
    );
  }

  let container = createBaseNodeContainer();

  container = withNpmCache(container);
  container = withLockfilesOnly(container, options.source, {
    packagePaths: packagePath,
  });
  container = withNpmAuth(container, options.githubToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });
  container = withInstalledDependencies(container, packagePath, {
    workspace: DEFAULT_WORKSPACE,
    npmCiArgs: ["--workspaces=false"],
  });
  // Reapply npm auth after copying the full source in case the repository ships its own .npmrc.
  container = withFullSource(container, options.source, {
    exclude: DEFAULT_SOURCE_EXCLUDES,
  });
  container = requirePackageLock(container, packagePath);
  container = withNpmAuth(container, options.githubToken, {
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
      "mkdir -p \"$package_dir\"",
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
  const tagName = await pushReleaseTag(options, manifest.version);

  return {
    action: "publish",
    packageName: manifest.name,
    publishedVersion: manifest.version,
    tagged: true,
    tagName,
  };
}

/**
 * Production release pipeline with PR version synchronization and main-only publishing.
 */
export async function releasePackage(
  options: ReleasePackageOptions,
): Promise<string> {
  const result =
    options.action === "sync-pr-version"
      ? await syncPrVersion(options)
      : await publishRelease(options);

  return serializeResult(result);
}
