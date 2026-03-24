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
import { withNpmAuth } from "../shared/npm.js";

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
    context = "release";
  } else if (ref === "refs/heads/main" || ref === "main") {
    context = "main";
  } else if (eventName === "workflow_dispatch") {
    context = "pr";
    if (!inputBranch) {
      throw new Error("Manual trigger (workflow_dispatch) requires inputBranch.");
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
  const exists = await checkRegistryVersion(packageName, finalVersion, githubToken);
  if (exists) {
    throw new Error(
      `Version "${finalVersion}" of package "${packageName}" already exists in registry.`,
    );
  }

  // 7. Prepare Container and Publish
  const registryScope = options.registryScope || extractScope(packageName) || "staytunedllp";

  let container = dag
    .container()
    .from(DEFAULT_IMAGE)
    .withWorkdir(DEFAULT_WORKSPACE);

  // Authentication
  container = withNpmAuth(container, githubToken, {
    registryScope,
    workspace: DEFAULT_WORKSPACE,
    npmrcPaths: ".",
  });

  // Source and Override Version
  container = container
    .withDirectory(DEFAULT_WORKSPACE, source, {
      exclude: [".git", "node_modules", "dist"],
    })
    .withExec([
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
      `,
    ]);

  // Install, Build, and Publish
  container = container.withExec([
    "bash",
    "-c",
    `${STRICT_SHELL_HEADER}
    npm ci --workspaces=false
    npm run build:publish
    npm publish --tag ${shellQuote(npmTag)}
    `,
  ]);

  return container.stdout();
}
