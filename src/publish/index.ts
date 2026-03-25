import { dag } from "@dagger.io/dagger";
import {
  checkRegistryVersion,
  extractScope,
  getPRNumber,
  readPackageJson,
  validateBaseVersion,
} from "./helpers.js";
import { PublishOptions, PublishContextType } from "./types.js";
import {
  DEFAULT_IMAGE,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "../shared/constants.js";
import { shellQuote } from "../shared/path-utils.js";
import {
  withFullSource,
  withInstalledDependencies,
  withLockfilesOnly,
  withNpmAuth,
} from "../shared/npm.js";
import { withNpmCache } from "../shared/container.js";

/**
 * Deterministic package publishing logic.
 */
export async function publishPackage(options: PublishOptions): Promise<string> {
  const {
    source,
    ref,
    eventName,
    inputBranch,
    githubToken,
    repoOwner,
    repoName,
  } = options;

  // 1. Resolve Context
  let context: PublishContextType;
  if (ref.startsWith("refs/tags/v")) {
    const tagVersion = ref.replace("refs/tags/v", "");
    if (tagVersion.includes("-")) {
      context = "pre-release";
    } else {
      context = "release";
    }
  } else if (ref === "refs/heads/main" || ref === "main") {
    context = "main";
  } else if (eventName === "workflow_dispatch") {
    context = "pr";
    if (!inputBranch) {
      throw new Error(
        "Manual trigger (workflow_dispatch) requires inputBranch.",
      );
    }
  } else {
    throw new Error(`Unsupported trigger: ref=${ref}, event=${eventName}`);
  }

  // 2. Read package.json
  const manifest = await readPackageJson(source);
  const baseVersion = manifest.version;
  const packageName = manifest.name;

  // 3. Validate Base Version
  validateBaseVersion(baseVersion);

  // 4. Resolve PR Number if needed
  let prNumber: number | undefined;
  if (context === "pr" && inputBranch) {
    prNumber = await getPRNumber(githubToken, repoOwner, repoName, inputBranch);
  }

  // 5. Generate Final Version
  let finalVersion: string;
  let npmTag: string;

  if (context === "release") {
    const tagVersion = ref.replace("refs/tags/v", "");
    if (tagVersion !== baseVersion) {
      throw new Error(
        `Tag version "${tagVersion}" does not match package.json version "${baseVersion}".`,
      );
    }
    finalVersion = baseVersion;
    npmTag = "latest";
  } else if (context === "pre-release") {
    const tagVersion = ref.replace("refs/tags/v", "");
    if (!tagVersion.startsWith(`${baseVersion}-`)) {
      throw new Error(
        `Pre-release tag "${tagVersion}" must be a suffix of base version "${baseVersion}".`,
      );
    }
    finalVersion = tagVersion;

    // Extract npm tag from the pre-release suffix (e.g., 1.0.2-rc.1 -> rc)
    const preReleasePart = tagVersion.split("-")[1];
    npmTag = preReleasePart.split(".")[0];
  } else if (context === "main") {
    finalVersion = `${baseVersion}-pre`;
    npmTag = "next";
  } else if (context === "pr" && prNumber !== undefined) {
    finalVersion = `${baseVersion}-pre-pr${prNumber}`;
    npmTag = `pr-${prNumber}`;
  } else {
    throw new Error("Failed to generate final version: Invalid context state.");
  }

  // 6. Registry Conflict Check
  const exists = await checkRegistryVersion(
    packageName,
    finalVersion,
    githubToken,
  );
  if (exists) {
    throw new Error(
      `Version "${finalVersion}" of package "${packageName}" already exists in registry.`,
    );
  }

  // 7. Prepare Container and Publish
  const registryScope =
    options.registryScope || extractScope(packageName) || "staytunedllp";

  let container = dag
    .container()
    .from(DEFAULT_IMAGE)
    .withWorkdir(DEFAULT_WORKSPACE);

  // Apply Volume Cache
  container = withNpmCache(container);

  // Lockfile-first Layering
  container = withLockfilesOnly(container, source);

  // Authentication
  container = withNpmAuth(container, githubToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });

  // Add GitHub token for release API operations
  container = container.withSecretVariable("GH_TOKEN", githubToken);

  // Install Dependencies (Layered Cache)
  container = withInstalledDependencies(container, ".", {
    npmCiArgs: ["--workspaces=false"],
  });

  // Add Full Source
  container = withFullSource(container, source);

  // Override Version and Publish
  container = container.withExec([
    "bash",
    "-c",
    `${STRICT_SHELL_HEADER}
    # Update package.json version locally only
    node -e '
      const fs = require("fs");
      const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
      pkg.version = "${finalVersion}";
      fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
    '
    npm run build:publish
    npm publish --tag ${shellQuote(npmTag)}
    `,
  ]);

  // Create GitHub prerelease for main/pre-release lines
  if (context === "main" || context === "pre-release") {
    const githubTag = `v${finalVersion}`;

    container = container.withExec([
      "bash",
      "-c",
      `${STRICT_SHELL_HEADER}
      # Ensure curl is available for GitHub API
      if ! command -v curl >/dev/null; then
        apt-get update -y && apt-get install -y curl
      fi

      echo "Checking existing release ${githubTag}"
      status=$(curl -s -o /tmp/release-status -w "%{http_code}" \
        -H "Authorization: token \${GH_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${repoOwner}/${repoName}/releases/tags/${githubTag}")

      if [ "$status" -eq 404 ]; then
        echo "Creating prerelease ${githubTag}"
        curl -s -X POST \
          -H "Authorization: token \${GH_TOKEN}" \
          -H "Accept: application/vnd.github+json" \
          "https://api.github.com/repos/${repoOwner}/${repoName}/releases" \
          -d '{"tag_name":"${githubTag}","name":"${githubTag}","body":"Automated pre-release for ${finalVersion}","prerelease":true}' \
          > /tmp/release-create.json
        cat /tmp/release-create.json
      else
        echo "Release ${githubTag} exists (HTTP \${status}), skipping create."
      fi`,
    ]);
  }

  return container.stdout();
}
