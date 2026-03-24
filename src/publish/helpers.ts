import { Container, Directory, Secret, dag } from "@dagger.io/dagger";
import { PackageManifest } from "./types.js";
import { STRICT_SHELL_HEADER } from "../shared/constants.js";

/**
 * Parses package.json from the source directory and returns it as a JSON object.
 */
export async function readPackageJson(source: Directory): Promise<PackageManifest> {
  const content = await source.file("package.json").contents();
  return JSON.parse(content) as PackageManifest;
}

/**
 * Extracts the scope from the package name (e.g., @staytunedllp/daggerverse -> staytunedllp).
 */
export function extractScope(packageName: string): string | undefined {
  if (packageName.startsWith("@") && packageName.includes("/")) {
    return packageName.substring(1, packageName.indexOf("/"));
  }
  return undefined;
}

/**
 * Validates the base version matches x.y.z and doesn't contain pre-release tags.
 */
export function validateBaseVersion(version: string): void {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    throw new Error(
      `Invalid base version "${version}" in package.json. Must be in x.y.z format without pre-release tags.`,
    );
  }
}

/**
 * Fetches the PR number for a given branch using the GitHub CLI (gh).
 */
export async function getPRNumber(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  branch: string,
): Promise<number> {
  const container = dag
    .container()
    .from("alpine:latest")
    .withExec(["apk", "add", "github-cli", "jq", "bash"])
    .withSecretVariable("GH_TOKEN", githubToken)
    .withExec([
      "bash",
      "-c",
      `${STRICT_SHELL_HEADER}
      gh pr list --repo "${repoOwner}/${repoName}" --head "${branch}" --state open --json number --jq '.[].number' > pr_numbers.txt
      `,
    ]);

  const output = await container.file("pr_numbers.txt").contents();
  const prNumbers = output
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (prNumbers.length === 0) {
    throw new Error(`No open PR found for branch "${branch}" in ${repoOwner}/${repoName}.`);
  }
  if (prNumbers.length > 1) {
    throw new Error(
      `Multiple open PRs found for branch "${branch}" in ${repoOwner}/${repoName}: ${prNumbers.join(", ")}.`,
    );
  }

  return parseInt(prNumbers[0], 10);
}

/**
 * Checks if a specific version of a package already exists in the registry.
 */
export async function checkRegistryVersion(
  packageName: string,
  version: string,
  githubToken: Secret,
): Promise<boolean> {
  const container = dag
    .container()
    .from("node:22-bookworm-slim")
    .withSecretVariable("NODE_AUTH_TOKEN", githubToken)
    .withExec([
      "bash",
      "-c",
      `${STRICT_SHELL_HEADER}
      echo "//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}" > .npmrc
      npm view "${packageName}@${version}" version --registry=https://npm.pkg.github.com --json > version.json || echo "null" > version.json
      `,
    ]);

  const output = await container.file("version.json").contents();
  const parsed = JSON.parse(output);

  // If npm view returns the version string, it exists. If it returns null (or empty/error), it doesn't.
  return parsed === version || (Array.isArray(parsed) && parsed.includes(version));
}
