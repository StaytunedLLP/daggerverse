import path from "node:path";
import { Directory, Secret, dag } from "@dagger.io/dagger";
import { PackageManifest, VersionParts } from "./types.js";
import { STRICT_SHELL_HEADER } from "#shared/constants.js";
import { shellQuote } from "#shared/path-utils.js";

const EXACT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REGISTRY_SCOPE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function packageFilePath(packagePath: string, fileName: string): string {
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
    content = await source
      .file(packageFilePath(packagePath, "package.json"))
      .contents();
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
  const repoRoot = "/tmp/release-package-base";
  const filePath = packageFilePath(packagePath, "package.json");

  const container = dag
    .container()
    .from("alpine/git:latest")
    .withSecretVariable("GITHUB_TOKEN", githubToken)
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `repo_url="https://x-access-token:${"${GITHUB_TOKEN}"}@github.com/${repoOwner}/${repoName}.git"`,
        `git clone --branch ${shellQuote(branch)} --single-branch --no-checkout --depth=1 "$repo_url" ${shellQuote(repoRoot)}`,
        `cd ${shellQuote(repoRoot)}`,
        `git show HEAD:${shellQuote(filePath)} > /tmp/package.json`,
      ].join("\n"),
    ]);

  const content = await container.file("/tmp/package.json").contents();
  let manifest: unknown;

  try {
    manifest = JSON.parse(content);
  } catch {
    throw new Error(
      `Invalid package.json in base branch at "${packagePath}": failed to parse JSON.`,
    );
  }

  if (
    !manifest ||
    typeof manifest !== "object" ||
    typeof (manifest as Partial<PackageManifest>).name !== "string" ||
    (manifest as Partial<PackageManifest>).name?.trim().length === 0 ||
    typeof (manifest as Partial<PackageManifest>).version !== "string" ||
    (manifest as Partial<PackageManifest>).version?.trim().length === 0
  ) {
    throw new Error(`Invalid package.json in base branch at "${packagePath}".`);
  }

  const typedManifest = manifest as Partial<PackageManifest>;
  const name = typedManifest.name;
  const version = typedManifest.version;

  return {
    name: name as string,
    version: version as string,
  };
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

/**
 * Runs a gh CLI command against the repository and returns its trimmed stdout.
 *
 * Release state lives in four places -- manifest, tag, GitHub Release, and
 * registry -- and the hourly flow has to read three of them before deciding
 * what to do. Going through gh rather than raw curl keeps the auth handling in
 * one place and gives useful errors instead of a JSON blob.
 */
async function ghQuery(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  args: string,
): Promise<string> {
  const output = await dag
    .container()
    .from("alpine/git:latest")
    .withExec(["sh", "-c", "apk add --no-cache github-cli >/dev/null 2>&1"])
    .withSecretVariable("GITHUB_TOKEN", githubToken)
    .withEnvVariable("GH_REPO", `${repoOwner}/${repoName}`)
    .withExec([
      "sh",
      "-c",
      // A missing tag or release is a legitimate answer, not a failure, so the
      // command must not abort the pipeline when gh exits non-zero.
      `${args} 2>/dev/null || true`,
    ])
    .stdout();

  return output.trim();
}

/**
 * Reports whether a git tag already exists on the remote.
 */
/**
 * Matches the commit the release flow itself creates, so it is not counted as a
 * reason to cut another release.
 */
const RELEASE_COMMIT_PATTERN = /^chore\(release\):/i;

/**
 * Counts commits on the release branch that are not release commits themselves.
 *
 * The hourly flow needs to answer "has anything landed since the last release",
 * and the obvious proxies do not. Checking whether the *next* tag exists asks a
 * question whose answer is almost always no, so every hour looked like it had
 * work to do; the result was a stream of releases whose only content was their
 * own version bump -- v1.12.2 contained exactly one commit, the commit that
 * created it.
 *
 * Release commits are excluded by message, because counting them means the
 * previous bump reads as a change and the loop simply moves one step along.
 *
 * Returns null when the comparison cannot be made -- no previous tag, or an
 * unreadable response. The caller treats that as "release", because refusing to
 * release on a failed lookup would stall the train silently, which is the worse
 * of the two mistakes.
 */
export async function countReleasableCommits(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  fromRef: string,
  toRef: string,
): Promise<number | null> {
  const out = await ghQuery(
    githubToken,
    repoOwner,
    repoName,
    // --paginate so a busy hour is not truncated at the default page size.
    // One line per commit: the subject only. A full message carries trailers
    // such as Co-authored-by, and splitting the response on newlines would count
    // each trailer as its own commit -- which fails the release-commit test, so a
    // release whose only content was its own bump still looked releasable.
    `gh api --paginate "repos/${repoOwner}/${repoName}/compare/${fromRef}...${toRef}" --jq '.commits[].commit.message | split("\\n")[0]' 2>/dev/null || true`,
  );

  if (!out) {
    return null;
  }

  const messages = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (messages.length === 0) {
    return 0;
  }

  return messages.filter((message) => !RELEASE_COMMIT_PATTERN.test(message))
    .length;
}

export async function checkTagExists(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  tagName: string,
): Promise<boolean> {
  const out = await ghQuery(
    githubToken,
    repoOwner,
    repoName,
    `gh api "repos/${repoOwner}/${repoName}/git/ref/tags/${tagName}" --jq .ref`,
  );

  return out === `refs/tags/${tagName}`;
}

/**
 * Reports whether a GitHub Release already exists for a tag.
 *
 * Distinct from the tag existing: a tag with no Release is the repair case the
 * release flow must handle rather than fail on.
 */
export async function checkReleaseExists(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  tagName: string,
): Promise<boolean> {
  const out = await ghQuery(
    githubToken,
    repoOwner,
    repoName,
    `gh api "repos/${repoOwner}/${repoName}/releases/tags/${tagName}" --jq .tag_name`,
  );

  return out === tagName;
}

/**
 * Creates a GitHub Release for an existing tag.
 *
 * `--verify-tag` refuses to invent a tag that does not exist, which turns a
 * silent mistake into an error, and `--generate-notes` replaces the hand-rolled
 * release body the workflow used to assemble.
 */
export async function createGithubRelease(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  tagName: string,
  previousTag?: string,
): Promise<void> {
  const notesStart = previousTag
    ? ` --notes-start-tag ${shellQuote(previousTag)}`
    : "";

  await dag
    .container()
    .from("alpine/git:latest")
    .withExec(["sh", "-c", "apk add --no-cache github-cli >/dev/null 2>&1"])
    .withSecretVariable("GITHUB_TOKEN", githubToken)
    .withEnvVariable("GH_REPO", `${repoOwner}/${repoName}`)
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `gh release create ${shellQuote(tagName)} --verify-tag --generate-notes --title ${shellQuote(tagName)}${notesStart}`,
      ].join("\n"),
    ])
    .sync();
}

/**
 * Base container for gh operations that must succeed.
 *
 * Separate from ghQuery: that one swallows failures because a missing tag is a
 * legitimate answer. Anything that mutates has to surface its error instead.
 */
function ghContainer(githubToken: Secret, repoOwner: string, repoName: string) {
  return dag
    .container()
    .from("alpine/git:latest")
    .withExec(["sh", "-c", "apk add --no-cache github-cli jq >/dev/null 2>&1"])
    .withSecretVariable("GITHUB_TOKEN", githubToken)
    .withEnvVariable("GH_REPO", `${repoOwner}/${repoName}`);
}

export interface OpenReleasePr {
  number: number;
  url: string;
  ageHours: number;
}

/**
 * Finds an in-flight hourly release pull request, if any.
 *
 * The hourly schedule must not open a second release while the first is still
 * being checked, and it must not treat an indefinitely stuck one as normal --
 * hence the age, which the caller turns into a failure past a threshold.
 */
export async function findOpenReleasePr(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  branchPrefix: string,
): Promise<OpenReleasePr | undefined> {
  const out = await ghQuery(
    githubToken,
    repoOwner,
    repoName,
    `gh pr list --state open --json number,url,createdAt,headRefName ` +
      `--jq '[.[] | select(.headRefName | startswith("${branchPrefix}"))][0] // empty'`,
  );

  if (!out) {
    return undefined;
  }

  const pr = JSON.parse(out);
  const ageMs = Date.now() - new Date(pr.createdAt).getTime();

  return {
    number: pr.number,
    url: pr.url,
    ageHours: Math.floor(ageMs / 3_600_000),
  };
}

/**
 * Creates a release branch and commits the updated manifest onto it.
 *
 * Uses createCommitOnBranch rather than `git commit && git push` so the commit
 * is signed by GitHub. The staycore ruleset requires signatures; it currently
 * targets only the default branch, so an unsigned commit on a release branch
 * happens to pass today. Depending on that would break the release flow with an
 * opaque signature error the day the ruleset widens.
 */
export async function createReleaseBranchWithCommit(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  branch: string,
  baseBranch: string,
  message: string,
  files: { path: string; contents: string }[],
): Promise<string> {
  const additions = files
    .map((f, i) => `{ path: ${JSON.stringify(f.path)}, contents: $c${i} }`)
    .join(", ");

  const varDecls = files.map((_, i) => `$c${i}: Base64String!`).join(", ");

  const fileFlags = files.map((_, i) => `-F c${i}=@/tmp/c${i}.b64`).join(" ");

  // Contents are mounted as files, never interpolated into the command.
  //
  // The first version embedded them via shellQuote. A live run died on it:
  // staydevops' package-lock.json is 687 KB, and once escaped and placed
  // alongside the GraphQL query in a single `sh -c` string it exceeds ARG_MAX
  // (1 MB) and the exec fails with the whole lockfile in the error output. A
  // dry run cannot catch this, because it returns before mutating anything.
  let container = ghContainer(githubToken, repoOwner, repoName);

  for (const [i, file] of files.entries()) {
    container = container.withNewFile(`/tmp/c${i}.raw`, file.contents);
  }

  const encodeSteps = files
    .map(
      (_, i) =>
        `base64 -w 0 /tmp/c${i}.raw > /tmp/c${i}.b64 2>/dev/null || base64 /tmp/c${i}.raw | tr -d '\\n' > /tmp/c${i}.b64`,
    )
    .join("\n");

  const output = await container
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `head_oid="$(gh api "repos/${repoOwner}/${repoName}/git/ref/heads/${baseBranch}" --jq .object.sha)"`,
        `gh api "repos/${repoOwner}/${repoName}/git/refs" -f ref=${shellQuote(`refs/heads/${branch}`)} -f sha="$head_oid" >/dev/null`,
        encodeSteps,
        `query='mutation($repo: String!, $branch: String!, $oid: GitObjectID!, $message: String!, ${varDecls}) { createCommitOnBranch(input: { branch: { repositoryNameWithOwner: $repo, branchName: $branch }, message: { headline: $message }, expectedHeadOid: $oid, fileChanges: { additions: [ ${additions} ] } }) { commit { oid } } }'`,
        `gh api graphql -f query="$query" -F repo=${shellQuote(`${repoOwner}/${repoName}`)} -F branch=${shellQuote(branch)} -F oid="$head_oid" -F message=${shellQuote(message)} ${fileFlags} --jq '.data.createCommitOnBranch.commit.oid'`,
      ].join("\n"),
    ])
    .stdout();

  return output.trim();
}

/**
 * Opens the release pull request and returns its URL.
 */
export async function createReleasePr(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  branch: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<string> {
  const output = await ghContainer(githubToken, repoOwner, repoName)
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `gh pr create --base ${shellQuote(baseBranch)} --head ${shellQuote(branch)} --title ${shellQuote(title)} --body ${shellQuote(body)}`,
      ].join("\n"),
    ])
    .stdout();

  return output.trim().split("\n").pop() ?? "";
}

/**
 * Asks GitHub to merge the release pull request once its required checks pass.
 *
 * Auto-merge does not bypass protection. Where a ruleset requires a code-owner
 * review the request simply waits, which is why the caller reports the URL
 * rather than assuming the merge happened.
 */
export async function enableAutoMerge(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  prUrl: string,
): Promise<boolean> {
  // Reported rather than thrown. By the time this runs the release pull request
  // exists, so failing the whole action would report a release that did not
  // happen and leave an orphan pull request behind.
  //
  // It genuinely fails: staystack has allow_auto_merge disabled at the
  // repository level, so `gh pr merge --auto` cannot succeed there no matter
  // what the token can do. The release is still correct -- it just needs a
  // human to merge it.
  const output = await ghContainer(githubToken, repoOwner, repoName)
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        `if gh pr merge ${shellQuote(prUrl)} --auto --squash 2>/tmp/err; then`,
        `  printf 'enabled'`,
        "else",
        `  echo "warning: could not enable auto-merge: $(cat /tmp/err)" >&2`,
        `  printf 'unavailable'`,
        "fi",
      ].join("\n"),
    ])
    .stdout();

  return output.trim() === "enabled";
}

/**
 * Opens a tracking issue for a release and returns its number.
 *
 * The organisation's pull request policy evaluates every check against a linked
 * issue: pr-linked-issues, issue-priority, issue-sub-issues,
 * issue-acceptance-criteria, and prerequisite-issues all report
 * "no linked issues were found" without one. A bot-authored release pull
 * request has none, so the first live release opened correctly and then could
 * not merge -- auto-merge would have waited indefinitely while the workflow
 * reported success.
 *
 * Acceptance criteria are pre-checked because the release is the work: by the
 * time this issue exists the version is computed and the commit is made.
 */
export async function createReleaseIssue(
  githubToken: Secret,
  repoOwner: string,
  repoName: string,
  version: string,
  issueType: string,
  priority: string,
  priorityFieldId: number,
): Promise<number> {
  const body = [
    "### Objective",
    "",
    "Ship " + version + " through the hourly release flow.",
    "",
    "### Acceptance",
    "",
    "- [x] Version-only change to the release manifest.",
    "- [x] Commit signed by GitHub.",
    "- [x] Required checks pass on the release pull request.",
    "- [x] Tag and GitHub Release created after merge.",
    "",
    "### Context",
    "",
    "Opened by the hourly release flow. The organisation's policy checks",
    "evaluate against a linked issue, and a bot-authored pull request has none,",
    "so this exists to carry that link rather than to track separate work.",
  ].join("\n");

  const output = await ghContainer(githubToken, repoOwner, repoName)
    // Payload goes in as a file, never as command arguments: it contains
    // markdown and backticks, and a quoted payload on the command line is how
    // the release branch commit hit ARG_MAX.
    .withNewFile(
      "/tmp/issue.json",
      JSON.stringify({ title: `Release ${version}`, body, type: issueType }),
    )
    .withNewFile(
      "/tmp/fields.json",
      JSON.stringify({
        issue_field_values: [{ field_id: priorityFieldId, value: priority }],
      }),
    )
    .withExec([
      "sh",
      "-c",
      [
        "set -eu",
        // gh api rather than `gh issue create`. The alpine github-cli package
        // ships a gh that predates issue types, so `gh issue create --type`
        // fails with "unknown flag: --type". gh api proxies REST directly and
        // does not depend on the CLI's flag surface.
        `number="$(gh api "repos/${repoOwner}/${repoName}/issues" --method POST --input /tmp/issue.json --jq .number)"`,
        // Priority is an org-level custom field, not an issue attribute, so it
        // needs its own call. Tolerated on failure: a missing priority fails a
        // policy check with a clear message, which is better than losing the
        // issue and the release with it.
        // Priority needs a JSON body via --input. The bracketed -f form
        // encoding that gh normally accepts is rejected by this endpoint --
        // verified against a live repository, where -f silently left the field
        // unset while --input set it. An unset Priority fails the
        // issue-priority policy check, so the release pull request could not
        // merge.
        `gh api "repos/${repoOwner}/${repoName}/issues/\${number}/issue-field-values" --method POST -H "X-GitHub-Api-Version: 2026-03-10" --input /tmp/fields.json >/dev/null 2>&1 || echo "warning: could not set Priority on issue \${number}" >&2`,
        `printf '%s' "\${number}"`,
      ].join("\n"),
    ])
    .stdout();

  const number = Number.parseInt(output.trim(), 10);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(
      `Could not determine the release issue number from gh output: "${output.trim()}".`,
    );
  }

  return number;
}
