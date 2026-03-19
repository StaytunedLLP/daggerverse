import { Container, Directory, Secret, dag } from "@dagger.io/dagger";
import {
  DEFAULT_REGISTRY_SCOPE,
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "./constants.js";
import { normalizePaths, resolveWorkspacePath, shellQuote } from "./path-utils.js";
import type {
  InstallOptions,
  LockfileOptions,
  NpmAuthOptions,
  PathInput,
  SourceOptions,
} from "./types.js";

function manifestIncludePatterns(packagePaths: PathInput | undefined): string[] {
  const paths = normalizePaths(packagePaths);
  const patterns: string[] = [];

  for (const path of paths) {
    if (path === ".") {
      // For root installs, include all manifests in the tree to support monorepo linking
      patterns.push("**/.npmrc", "**/package-lock.json", "**/package.json");
    } else {
      patterns.push(
        `${path}/.npmrc`,
        `${path}/package-lock.json`,
        `${path}/package.json`,
      );
    }
  }

  // Ensure root manifests are always included as they are required for npm ci in monorepos
  patterns.push(".npmrc", "package-lock.json", "package.json");

  return [...new Set(patterns)];
}

function buildManifestDirectory(
  source: Directory,
  packagePaths: PathInput | undefined,
): Directory {
  return dag.directory().withDirectory("/", source, {
    include: manifestIncludePatterns(packagePaths),
  });
}

function buildRequireLockfileScript(workspace: string, cwd: string): string {
  const target = resolveWorkspacePath(workspace, cwd);

  return [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(target)}`,
    'test -f package-lock.json || { echo "Missing $(pwd)/package-lock.json" >&2; exit 1; }',
  ].join("\n");
}

export function withNpmAuth(
  container: Container,
  nodeAuthToken: Secret,
  options: NpmAuthOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const registryScope = options.registryScope ?? DEFAULT_REGISTRY_SCOPE;
  const npmrcPaths = normalizePaths(options.npmrcPaths);

  return container
    .withSecretVariable("NODE_AUTH_TOKEN", nodeAuthToken)
    .withExec([
      "bash",
      "-lc",
      [
        STRICT_SHELL_HEADER,
        "cat > /tmp/staytuned.npmrc <<EOF",
        `@${registryScope}:registry=https://npm.pkg.github.com`,
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
        "always-auth=true",
        "EOF",
        `for path in $(printf '%s' ${JSON.stringify(npmrcPaths.join(","))} | tr ',' ' '); do`,
        "  target=\"${path}\"",
        "  if [ \"${target}\" = \".\" ]; then",
        `    cp /tmp/staytuned.npmrc ${shellQuote(workspace)}/.npmrc`,
        "  else",
        `    mkdir -p ${shellQuote(workspace)}/\"\${target}\"`,
        `    cp /tmp/staytuned.npmrc ${shellQuote(workspace)}/\"\${target}\"/.npmrc`,
        "  fi",
        "done",
      ].join("\n"),
    ]);
}

export function withLockfilesOnly(
  container: Container,
  source: Directory,
  options: LockfileOptions = {},
): Container {
  return container.withDirectory(
    options.workspace ?? DEFAULT_WORKSPACE,
    buildManifestDirectory(source, options.packagePaths),
  );
}

export function requirePackageLock(
  container: Container,
  cwd = ".",
  options: LockfileOptions = {},
): Container {
  return container.withExec([
    "bash",
    "-lc",
    buildRequireLockfileScript(options.workspace ?? DEFAULT_WORKSPACE, cwd),
  ]);
}

export function withInstalledDependencies(
  container: Container,
  packagePaths: PathInput = ".",
  options: InstallOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const npmCiArgs = options.npmCiArgs ?? [];
  const installArgs = ["npm", "ci", ...npmCiArgs].map(shellQuote).join(" ");
  const scripts = [STRICT_SHELL_HEADER];

  for (const packagePath of normalizePaths(packagePaths)) {
    scripts.push(buildRequireLockfileScript(workspace, packagePath));
    scripts.push(installArgs);
  }

  return container.withExec(["bash", "-lc", scripts.join("\n")]);
}

export function withFullSource(
  container: Container,
  source: Directory,
  options: SourceOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const exclude = options.exclude ?? DEFAULT_SOURCE_EXCLUDES;
  const strategy = options.strategy ?? "replace";

  if (strategy === "replace") {
    return container.withDirectory(workspace, source, { exclude });
  }

  // Overlay strategy (merges source into workspace without deleting existing files)
  const tempPath = "/tmp/dagger-source-overlay";

  return container
    .withDirectory(tempPath, source, { exclude })
    .withExec([
      "bash",
      "-lc",
      [
        STRICT_SHELL_HEADER,
        `tar -C ${tempPath} -cf - . | tar -C ${shellQuote(workspace)} -xf -`,
        `rm -rf ${tempPath}`,
      ].join("\n"),
    ]);
}
