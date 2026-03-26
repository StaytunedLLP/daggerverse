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
    releasePrNumber,
    githubToken,
    repoOwner,
    repoName,
  } = options;

  // 1. Resolve Context
  let context: PublishContextType;
  if (eventName === "pull_request") {
    context = "main";
  } else if (eventName === "workflow_dispatch") {
    context = releasePrNumber !== undefined ? "main" : "pr";
    if (context === "pr" && !inputBranch) {
      throw new Error(
        "Manual trigger (workflow_dispatch) requires inputBranch.",
      );
    }
  } else {
    throw new Error(
      `Unsupported event \"${eventName}\". Allowed events: pull_request, workflow_dispatch.`,
    );
  }

  // 2. Read package.json
  const manifest = await readPackageJson(source);
  const packageVersion = manifest.version;
  const packageName = manifest.name;

  // 3. Validate Base Version
  validateBaseVersion(packageVersion);

  // For merged release-PR publish, use the version in package.json from the merged commit.
  // For manual PR publish, use the version from the selected PR branch package.json.
  let baseVersion = packageVersion;

  // 4. Resolve PR Number if needed
  let prNumber: number | undefined;
  if (context === "pr" && inputBranch) {
    prNumber = await getPRNumber(githubToken, repoOwner, repoName, inputBranch);
  }

  // 5. Generate Final Version
  let finalVersion: string;
  let npmTag: string;

  if (context === "main") {
    finalVersion = packageVersion;
    npmTag = "latest";
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
  if (exists && context === "pr") {
    throw new Error(
      `Version "${finalVersion}" of package "${packageName}" already exists in registry.`,
    );
  }

  // 7. Prepare Container and Publish
  const registryScope =
    options.registryScope || extractScope(packageName) || "staytunedllp";
  const releaseTag = `v${finalVersion}`;

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

  // Install Dependencies (Layered Cache)
  container = withInstalledDependencies(container, ".", {
    npmCiArgs: ["--workspaces=false"],
  });

  // Add Full Source
  container = withFullSource(container, source);

  const skipNpmPublish = exists && context === "main";

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
    if [[ "${skipNpmPublish}" != "true" ]]; then
      npm publish --tag ${shellQuote(npmTag)}
    fi
    `,
  ]);

  return container.stdout();
}
