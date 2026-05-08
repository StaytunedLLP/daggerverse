import path from "node:path";
import { Directory, Secret, dag } from "@dagger.io/dagger";
import { PackageManifest, VersionParts } from "./types.js";
import { STRICT_SHELL_HEADER } from "../shared/constants.js";

const EXACT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REGISTRY_SCOPE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function packageFilePath(packagePath: string, fileName: string): string {
  if (packagePath === "." || packagePath.length === 0) {
    return fileName;
  }

  return path.posix.join(packagePath, fileName);
}

/**
 * Reads and validates the root package.json manifest.
 */
export async function readPackageJson(
  source: Directory,
): Promise<PackageManifest> {
  return readPackageJsonAtPath(source);
}

/**
 * Reads and validates package.json from a package path within the source directory.
 */
export async function readPackageJsonAtPath(
  source: Directory,
  packagePath = ".",
): Promise<PackageManifest> {
  let content: string;

  try {
    content = await source.file(packageFilePath(packagePath, "package.json")).contents();
  } catch {
    throw new Error(
      `Missing package.json in the source directory at "${packagePath}".`,
    );
  }

  let manifest: unknown;

  try {
    manifest = JSON.parse(content);
  } catch {
    throw new Error("Invalid package.json: failed to parse JSON.");
  }

  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid package.json: expected a JSON object.");
  }

  const { name, version } = manifest as Partial<PackageManifest>;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error(
      "Invalid package.json: expected a non-empty string name field.",
    );
  }

  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error(
      "Invalid package.json: expected a non-empty string version field.",
    );
  }

  return { name, version };
}

/**
 * Ensures a required file exists in the source directory.
 */
export async function ensureFileExists(
  source: Directory,
  filePath: string,
): Promise<void> {
  if (!(await source.exists(filePath))) {
    throw new Error(`Missing ${filePath} in the source directory.`);
  }
}

/**
 * Ensures a required file exists within a package path in the source directory.
 */
export async function ensureFileExistsAtPath(
  source: Directory,
  packagePath: string,
  fileName: string,
): Promise<void> {
  const filePath = packageFilePath(packagePath, fileName);

  if (!(await source.exists(filePath))) {
    throw new Error(`Missing ${filePath} in the source directory.`);
  }
}

/**
 * Extracts the package scope from a scoped npm package name.
 */
export function extractScope(packageName: string): string | undefined {
  if (packageName.startsWith("@") && packageName.includes("/")) {
    return packageName.slice(1, packageName.indexOf("/"));
  }

  return undefined;
}

/**
 * Validates the npm registry scope used for GitHub Packages authentication.
 */
export function validateRegistryScope(registryScope: string): string {
  if (!REGISTRY_SCOPE_PATTERN.test(registryScope)) {
    throw new Error(
      `Invalid registry scope "${registryScope}". Expected lowercase npm scope characters only.`,
    );
  }

  return registryScope;
}

/**
 * Validates an exact semver string and returns its numeric parts.
 */
export function parseExactVersion(version: string): VersionParts {
  const match = EXACT_SEMVER_PATTERN.exec(version);

  if (!match) {
    throw new Error(
      `Invalid version "${version}" in package.json. Expected exact x.y.z semver.`,
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Compares two exact semver versions.
 */
export function compareVersions(left: string, right: string): number {
  const leftParts = parseExactVersion(left);
  const rightParts = parseExactVersion(right);

  if (leftParts.major !== rightParts.major) {
    return leftParts.major - rightParts.major;
  }

  if (leftParts.minor !== rightParts.minor) {
    return leftParts.minor - rightParts.minor;
  }

  return leftParts.patch - rightParts.patch;
}

/**
 * Calculates the next patch version from an exact semver string.
 */
export function nextPatchVersion(version: string): string {
  const parts = parseExactVersion(version);
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
}

/**
 * Builds the repository URL used for authenticated git reads.
 */
export function repositoryUrl(repoOwner: string, repoName: string): string {
  return `https://github.com/${repoOwner}/${repoName}.git`;
}

/**
 * Reads package.json from the authoritative base branch.
 */
export async function readBaseBranchPackageJson(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  branch: string,
  packagePath = ".",
): Promise<PackageManifest> {
  const token = await githubToken.plaintext();
  const filePath = packageFilePath(packagePath, "package.json");
  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to read ${filePath} from ${repoOwner}/${repoName}@${branch}: ${response.status} ${response.statusText} - ${text}`,
    );
  }

  const payload = (await response.json()) as {
    content?: string;
    encoding?: string;
  };

  if (payload.encoding !== "base64" || typeof payload.content !== "string") {
    throw new Error(
      `Unexpected GitHub API response while reading ${filePath} from ${repoOwner}/${repoName}@${branch}.`,
    );
  }

  const content = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString(
    "utf8",
  );

  return readPackageJsonAtPath(
    dag.directory().withNewFile(filePath, content),
    packagePath,
  );
}

/**
 * Checks whether the target package version already exists in GitHub Packages.
 */
export async function checkRegistryVersion(
  packageName: string,
  version: string,
  githubToken: Secret,
  registryScope: string,
): Promise<boolean> {
  const container = dag
    .container()
    .from("node:24-bookworm")
    .withSecretVariable("NODE_AUTH_TOKEN", githubToken)
    .withExec([
      "bash",
      "-lc",
      [
        STRICT_SHELL_HEADER,
        `cat > .npmrc <<'EOF'`,
        `@${registryScope}:registry=https://npm.pkg.github.com`,
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
        "EOF",
        `npm view "${packageName}@${version}" version --registry=https://npm.pkg.github.com --json > version.json || echo "null" > version.json`,
      ].join("\n"),
    ]);

  const output = await container.file("version.json").contents();
  const parsed = JSON.parse(output);

  return (
    parsed === version || (Array.isArray(parsed) && parsed.includes(version))
  );
}
