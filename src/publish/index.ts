import {
  checkRegistryVersion,
  ensureFileExistsAtPath,
  extractScope,
  compareVersions,
  nextPatchVersion,
  parseExactVersion,
  readBaseBranchPackageJson,
  readPackageJsonAtPath,
  validateRegistryScope,
} from "./helpers.js";
import {
  ReleasePackageOptions,
  ReleasePackageResult,
  PublishPackageResult,
  SyncPrVersionResult,
} from "./types.js";
import {
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "../shared/constants.js";
import { createBaseNodeContainer, withNpmCache } from "../shared/container.js";
import { resolveWorkspacePath, shellQuote } from "../shared/path-utils.js";
import {
  requirePackageLock,
  withFullSource,
  withInstalledDependencies,
  withLockfilesOnly,
  withNpmAuth,
} from "../shared/npm.js";

const SYNC_WORKSPACE = "/tmp/release-package-sync";

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
    };
  }

  if (!options.prBranch || options.prBranch.trim().length === 0) {
    throw new Error("A pull request branch name is required to sync PR versions.");
  }

  const newVersion = nextPatchVersion(mainManifest.version);
  let container = createBaseNodeContainer({ workspace: SYNC_WORKSPACE });

  container = withNpmCache(container);
  container = withFullSource(container, options.source, {
    workspace: SYNC_WORKSPACE,
    exclude: ["dagger", "dist", "node_modules"],
  });
  container = requirePackageLock(container, packagePath, {
    workspace: SYNC_WORKSPACE,
  });
  container = container.withSecretVariable("GITHUB_TOKEN", options.githubToken);
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(resolveWorkspacePath(SYNC_WORKSPACE, packagePath))}`,
      `npm_config_ignore_scripts=true npm version ${shellQuote(newVersion)} --no-git-tag-version`,
      `cd ${shellQuote(SYNC_WORKSPACE)}`,
      `git config user.name "github-actions[bot]"`,
      `git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`,
      `git remote set-url origin "https://x-access-token:\${GITHUB_TOKEN}@github.com/${options.repoOwner}/${options.repoName}.git"`,
      `git add ${shellQuote(resolveWorkspacePath(SYNC_WORKSPACE, packagePath) + "/package.json")} ${shellQuote(resolveWorkspacePath(SYNC_WORKSPACE, packagePath) + "/package-lock.json")}`,
      `git commit -m ${shellQuote(`chore(release): bump version to v${newVersion}`)}`,
      `git push origin "HEAD:${options.prBranch}"`,
    ].join("\n"),
  ]);

  await container.sync();

  return {
    action: "sync-pr-version",
    baseBranch,
    prBranch: options.prBranch,
    mainVersion: mainManifest.version,
    currentVersion: manifest.version,
    newVersion,
    changed: true,
    committed: true,
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
    workspace: DEFAULT_WORKSPACE,
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
    exclude: ["dagger", "dist", "node_modules"],
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
      `cd ${shellQuote(DEFAULT_WORKSPACE)}`,
      "npm publish --tag latest",
    ].join("\n"),
  ]);

  container = container.withSecretVariable("GITHUB_TOKEN", options.githubToken);
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(DEFAULT_WORKSPACE)}`,
      `git config user.name "github-actions[bot]"`,
      `git config user.email "41898282+github-actions[bot]@users.noreply.github.com"`,
      `git remote set-url origin "https://x-access-token:\${GITHUB_TOKEN}@github.com/${options.repoOwner}/${options.repoName}.git"`,
      `git tag -a ${shellQuote(`v${manifest.version}`)} -m ${shellQuote(`Release v${manifest.version}`)}`,
      `git push origin ${shellQuote(`v${manifest.version}`)}`,
    ].join("\n"),
  ]);

  await container.sync();

  return {
    action: "publish",
    packageName: manifest.name,
    publishedVersion: manifest.version,
    tagged: true,
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
