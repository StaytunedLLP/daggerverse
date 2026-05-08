import path from "node:path";
import { Directory } from "@dagger.io/dagger";
import {
  checkRegistryVersion,
  compareVersions,
  ensureFileExists,
  extractScope,
  nextPatchVersion,
  parseExactVersion,
  readBaseBranchPackageJson,
  readPackageJson,
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

const DEFAULT_BASE_BRANCH = "main";

function serializeResult(result: ReleasePackageResult): string {
  return JSON.stringify(result, null, 2);
}

function resolveRegistryScope(
  packageName: string,
  registryScope?: string,
): string {
  return registryScope ?? extractScope(packageName) ?? "staytunedllp";
}

async function exportUpdatedManifestFiles(
  updatedWorkspace: Directory,
): Promise<void> {
  // Dagger updates the manifests inside an isolated workspace, so export just the
  // mutated files back into the checked-out repository for the GitHub workflow to commit.
  await updatedWorkspace
    .filter({
      include: ["package.json", "package-lock.json"],
    })
    .export(path.resolve(process.cwd()));
}

async function syncPrVersion(
  options: ReleasePackageOptions,
): Promise<SyncPrVersionResult> {
  const baseBranch = options.baseBranch ?? DEFAULT_BASE_BRANCH;
  const mainManifest = await readBaseBranchPackageJson(
    options.githubToken,
    options.repoOwner,
    options.repoName,
    baseBranch,
  );
  const prManifest = await readPackageJson(options.source);

  await ensureFileExists(options.source, "package-lock.json");
  parseExactVersion(mainManifest.version);
  parseExactVersion(prManifest.version);

  if (compareVersions(prManifest.version, mainManifest.version) > 0) {
    return {
      action: "sync-pr-version",
      baseBranch,
      prBranch: options.prBranch,
      mainVersion: mainManifest.version,
      prVersion: prManifest.version,
      changed: false,
    };
  }

  const newVersion = nextPatchVersion(mainManifest.version);
  const workspacePath = "/tmp/release-package-sync";
  let container = createBaseNodeContainer({ workspace: workspacePath });

  container = withNpmCache(container);
  container = withFullSource(container, options.source, {
    exclude: DEFAULT_SOURCE_EXCLUDES,
  });
  container = requirePackageLock(container, ".", { workspace: workspacePath });
  container = container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(workspacePath)}`,
      `npm version ${shellQuote(newVersion)} --no-git-tag-version`,
    ].join("\n"),
  ]);

  await exportUpdatedManifestFiles(container.directory(workspacePath));

  return {
    action: "sync-pr-version",
    baseBranch,
    prBranch: options.prBranch,
    mainVersion: mainManifest.version,
    prVersion: prManifest.version,
    changed: true,
    newVersion,
  };
}

async function publishRelease(
  options: ReleasePackageOptions,
): Promise<PublishPackageResult> {
  const manifest = await readPackageJson(options.source);
  const registryScope = resolveRegistryScope(
    manifest.name,
    options.registryScope,
  );

  await ensureFileExists(options.source, "package-lock.json");
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
  container = withLockfilesOnly(container, options.source);
  container = withNpmAuth(container, options.githubToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });
  container = withInstalledDependencies(container, ".", {
    workspace: DEFAULT_WORKSPACE,
    npmCiArgs: ["--workspaces=false"],
  });
  // Reapply npm auth after copying the full source in case the repository ships its own .npmrc.
  container = withFullSource(container, options.source, {
    exclude: DEFAULT_SOURCE_EXCLUDES,
  });
  container = requirePackageLock(container);
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

  await container.sync();

  return {
    action: "publish",
    packageName: manifest.name,
    publishedVersion: manifest.version,
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
