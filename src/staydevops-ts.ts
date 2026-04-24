import {
  Directory,
  File,
  Secret,
  argument,
  check,
  func,
  object,
} from "@dagger.io/dagger";
import { checkPrTitleFromEvent } from "./checks/pr-checks.js";
import {
  deleteCloudRunService,
  deployCloudRunStaticSitePipeline,
} from "./cloud-run/service.js";
import { runNodeChecks } from "./checks/node-checks.js";
import { prepareNodeWorkspace } from "./copilot/prepare-node-workspace.js";
import {
  gitDiffBetweenCommits,
  gitDiffPrevious,
  gitDiffStaged,
} from "./git/index.js";
import { publishPackage } from "./publish/index.js";
import { runPlaywrightTests } from "./playwright/index.js";

type CheckMode = "format" | "lint" | "build" | "test";

/**
 * Collection of repository checks and validation tools for Node.js projects.
 *
 * This sub-module provides high-performance, cache-efficient workflows for
 * common CI tasks such as formatting, linting, testing, and building.
 * It is designed to work seamlessly in both standard repositories and monorepos.
 */
@object()
export class Checks {
  private async runDefaultCheck(
    source: Directory,
    mode: CheckMode,
  ): Promise<void> {
    await runNodeChecks(source, undefined, {
      [mode]: true,
    });
  }

  /**
   * Fully prepares a Node.js workspace environment by:
   * 1. Synchronizing repository manifests (.npmrc, package-lock.json).
   * 2. Authenticating with the GitHub Packages registry.
   * 3. Mounting persistent cache volumes for maximum performance.
   * 4. Installing production and development dependencies via 'npm ci'.
   * 5. (Optional) Provisioning Playwright browsers and system dependencies.
   * 6. (Optional) Bootstrapping Firebase CLI tooling.
   *
   * @param source - Repository source directory to install into the workspace container.
   * @param nodeAuthToken - Optional secret token for GitHub Packages npm authentication. Required for private packages.
   * @param packagePaths - Relative path (or CSV list of paths) where npm installs should run. Defaults to the source root.
   * @param playwrightInstall - Enable to install Playwright browsers and OS-level system dependencies into the container.
   * @param firebaseTools - Enable to install the Firebase CLI (firebase-tools) into the prepared workspace.
   *
   * @example
   * dagger call checks install --source . --playwright-install
   */
  @func()
  async install(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
    playwrightInstall = false,
    firebaseTools = false,
  ): Promise<Directory> {
    return prepareNodeWorkspace(source, nodeAuthToken, {
      packagePaths,
      playwrightInstall,
      firebaseTools,
    });
  }

  /**
   * Validates repository formatting using the standard `npm run format:check` command.
   *
   * @param source - Repository source directory to validate.
   *
   * @example
   * dagger call checks format --source .
   */
  @check()
  @func()
  async format(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  /**
   * Executes the repository linter using the standard `npm run lint` command.
   *
   * @param source - Repository source directory to lint.
   *
   * @example
   * dagger call checks lint --source .
   */
  @check()
  @func()
  async lint(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  /**
   * Verifies that the repository builds successfully using the `npm run build` command.
   *
   * @param source - Repository source directory to build.
   *
   * @example
   * dagger call checks build --source .
   */
  @check()
  @func()
  async build(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  /**
   * Executes the standard repository test suite using the `npm run test` command.
   *
   * @param source - Repository source directory to test.
   *
   * @example
   * dagger call checks test --source .
   */
  @check()
  @func()
  async test(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }


}

/**
 * Shared Dagger module for Node/TypeScript repository checks and deployment helpers.
 *
 * `Staydevops-TS` is a comprehensive toolkit designed to streamline CI/CD pipelines
 * for modern TypeScript applications. It provides a suite of high-level Dagger functions
 * for:
 *
 * - 🔍 **Repository Health**: Automated linting, formatting, and build verification.
 * - 🧪 **Advanced Testing**: Integrated Playwright E2E testing with built-in "Affected Test" discovery.
 * - 🚀 **Cloud Run Deployment**: Dagger-owned build and deploy pipelines for Vite applications.
 * - 📦 **Package Publishing**: Deterministic npm publishing with automatic GitHub Release integration.
 * - 📂 **Git Utilities**: Helpers for discovering changed files and diff ranges.
 *
 * Built with performance and security in mind, this module leverages Dagger's
 * advanced caching and secure secret handling to provide a robust foundation for
 * staytunedllp infrastructure and beyond.
 */
@object()
export class StaydevopsTs {
  /**
   * Validates the PR title according to Conventional Commits naming convention.
   *
   * @param eventFile - Optional GitHub event JSON file containing the PR title.
   * @param githubToken - Optional GitHub token to post a comment if validation fails.
   *
   * @example
   * dagger call check-pr-title --event-file=$GITHUB_EVENT_PATH --github-token=env:GITHUB_TOKEN
   */
  @check()
  @func()
  async checkPrTitle(
    eventFile?: File,
    githubToken?: Secret,
  ): Promise<void> {
    await checkPrTitleFromEvent(eventFile, githubToken);
  }

  /**
   * Returns the collection of repository checks.
   *
   * @example
   * dagger call checks lint --source .
   */
  @func()
  checks(): Checks {
    return new Checks();
  }

  /**
   * Orchestrates high-performance Playwright E2E test execution.
   *
   * Includes advanced features like dependency layering, browser caching, and
   * Staytuned's "Affected Test" discovery for lightning-fast feedback loops.
   *
   * @param source - The repository source directory.
   * @param nodeAuthToken - Optional secret token for GitHub Packages npm authentication.
   * @param packagePaths - The target package path (or CSV list) relative to the source root.
   * @param testSelector - Optional selector expression (path or tag) passed to Playwright via `--`.
   * @param testScript - The npm script to invoke for testing. Defaults to 'test:e2e'.
   * @param runBuild - When true, ensures 'npm run build' completes before test execution. Highly recommended for TypeScript projects.
   * @param registryScope - The GitHub Packages organization scope (e.g. 'staytunedllp').
   * @param browsers - Comma-separated list of browsers to provision (supported: 'chromium', 'firefox', 'webkit').
   * @param runAffected - Enable intelligent test discovery to run only tests affected by your current git diff.
   * @param base - The base git ref to compare against for affected discovery (e.g. 'origin/main').
   * @param listOnly - Disables test execution and instead returns the discovered test selectors as a string.
   * @param changedFiles - Manually specify a list of changed files to use for affected discovery, bypassing git diff.
   *
   * @example
   * dagger call test-playwright --source . --package-paths "apps/web" --run-affected
   */
  @func()
  async testPlaywright(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
    testSelector = "",
    testScript = "test:e2e",
    runBuild = true,
    registryScope = "staytunedllp",
    browsers = "chromium",
    runAffected = false,
    base = "origin/main",
    listOnly = false,
    changedFiles = "",
    skipReferenceChecks = true,
  ): Promise<string> {
    // Verify chromium-bidi using the private helper
    await this.verifyChromiumBidi(source, nodeAuthToken, packagePaths);

    return runPlaywrightTests(source, {
      nodeAuthToken,
      packagePaths,
      testSelector,
      testScript,
      runBuild,
      registryScope,
      browsers,
      runAffected,
      base,
      listOnly,
      changedFiles,
      skipReferenceChecks,
    });
  }

  /**
   * Validate that `chromium-bidi` is installed in the selected package path.
   *
   * @param source - Repository source directory that contains the package to inspect.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root. The first path is used for the chromium-bidi check.
   */
  private async verifyChromiumBidi(
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
  ): Promise<string> {
    return runNodeChecks(source, nodeAuthToken, {
      packagePaths,
      verifyChromiumBidi: true,
    });
  }

  /**
   * Retrieves an array of changed file paths using git diff.
   *
   * This is a powerful helper for automating logic based on PR changes.
   *
   * @param source - The source directory to check for changed files.
   * @param mode - The diffing strategy: 'staged' (uncommitted), 'previous' (last commit), or 'between' (custom range).
   * @param commitRange - The specific git range string (e.g. "HEAD~2..HEAD"). Required if mode is 'between'.
   *
   * @example
   * # Check for files in current PR branch
   * dagger call git-diff --source . --mode staged
   */
  @func()
  async gitDiff(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
    mode: string = "staged",
    commitRange = "",
  ): Promise<string[]> {
    switch (mode) {
      case "staged":
        return gitDiffStaged(source);
      case "previous":
        return gitDiffPrevious(source);
      case "between":
        if (!commitRange) {
          throw new Error("commitRange is required for 'between' mode");
        }
        return gitDiffBetweenCommits(source, commitRange);
      default: {
        throw new Error("Unsupported git diff mode");
      }
    }
  }

  /**
   * Builds a Vite application in Dagger, publishes a Cloud Run image, and deploys or deletes the service.
   *
   * This flow removes Firebase-managed builds entirely. `deploy` builds the app,
   * injects validated `VITE_*` config, packages a static runtime image, publishes it to
   * Artifact Registry, and deploys the image to Cloud Run. `delete` removes the Cloud Run service.
   *
   * @param action - The service lifecycle action: 'deploy' or 'delete'.
   * @param projectId - The target GCP project ID.
   * @param service - The Cloud Run service name.
   * @param region - The Cloud Run region (for example, 'us-central1').
   * @param repository - The Artifact Registry Docker repository name.
   * @param gcpCredentials - Secret containing the GCP service account JSON key.
   * @param source - Repository source directory (required for 'deploy').
   * @param viteConfig - Secret JSON object containing build-time `VITE_*` values (required for 'deploy').
   * @param frontendDir - Relative path to the Vite application directory. Defaults to '.'.
   * @param buildScript - npm build script name. Defaults to 'build'.
   * @param distDir - Build output directory. Defaults to 'dist'.
   * @param imageName - Optional image name override. Defaults to the service name.
   * @param imageTag - Optional image tag. Defaults to 'latest'.
   * @param nodeAuthToken - Optional GitHub Packages npm authentication token.
   * @param registryScope - Optional GitHub Packages scope. Defaults to 'staytunedllp'.
   * @param allowUnauthenticated - Whether to allow unauthenticated access on deploy. Defaults to true.
   * @param registryRegion - Optional Artifact Registry location. Defaults to the Cloud Run region.
   *
   * @example
   * dagger call cloud-run-static-site --action deploy --source . --project-id "my-project" --service "web-app" --repository "preview-images" --gcp-credentials env:GCP_KEY --vite-config env:VITE_CONFIG
   */
  @func({ cache: "never" })
  async cloudRunStaticSite(
    action: string,
    projectId: string,
    service: string,
    region: string,
    repository: string,
    gcpCredentials: Secret,
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source?: Directory,
    viteConfig?: Secret,
    frontendDir = ".",
    buildScript = "build",
    distDir = "dist",
    imageName = "",
    imageTag = "latest",
    nodeAuthToken?: Secret,
    registryScope = "staytunedllp",
    allowUnauthenticated = true,
    registryRegion = "",
  ): Promise<string> {
    if (action === "deploy") {
      if (!source) {
        throw new Error("source is required for 'deploy' action");
      }
      if (!viteConfig) {
        throw new Error("viteConfig is required for 'deploy' action");
      }
      return deployCloudRunStaticSitePipeline(
        source,
        projectId,
        service,
        region,
        repository,
        gcpCredentials,
        viteConfig,
        {
          frontendDir,
          buildScript,
          distDir,
          imageName,
          imageTag,
          nodeAuthToken,
          registryScope,
          allowUnauthenticated,
          registryRegion,
        },
      );
    }

    if (action === "delete") {
      return deleteCloudRunService(
        projectId,
        service,
        region,
        gcpCredentials,
      );
    }

    throw new Error("Unsupported action");
  }

  /**
   * Firebase App Hosting source-based deploys were removed in favor of Cloud Run images built inside Dagger.
   */
  @func({ cache: "never" })
  async fbWebhosting(): Promise<string> {
    throw new Error(
      "fbWebhosting has been removed. Use cloudRunStaticSite so Dagger owns the build and Cloud Run consumes a prebuilt image.",
    );
  }

  /**
   * Firebase App Hosting lifecycle management was removed because preview lifecycle now belongs to Cloud Run services.
   */
  @func({ cache: "never" })
  async fbApphosting(): Promise<string> {
    throw new Error(
      "fbApphosting has been removed. Use cloudRunStaticSite with action 'deploy' or 'delete' so Firebase no longer manages builds.",
    );
  }

  /**
   * Deterministic and secure npm package publishing pipeline.
   *
   * This function manages the full release lifecycle including:
   * 1. Version validation and conflict checking against the GitHub Packages registry.
   * 2. Automated PR-based pre-release versioning (e.g. 1.0.0-pre-pr42).
   * 3. Collaborative release finalization for merged Pull Requests.
   * 4. Creation of GitHub Releases and associated git tags.
   *
   * @param source - Repository source directory to publish from.
   * @param ref - The git ref triggering the release (e.g. 'refs/heads/main' or a tag).
   * @param eventName - The GitHub event name (allowed: 'workflow_dispatch', 'push').
   * @param githubToken - GitHub Personal Access Token (PAT) with repository and package write scopes.
   * @param repoOwner - The GitHub organization or user (e.g. 'StaytunedLLP').
   * @param repoName - The repository name.
   * @param inputBranch - The branch name to target when triggered via manual dispatch.
   * @param releasePrNumber - The Pull Request number associated with the release (for automated finalization).
   * @param registryScope - The organization scope for the npm package. Defaults to 'staytunedllp'.
   *
   * @example
   * dagger call publish-package --source . --ref "refs/heads/main" --github-token env:GITHUB_TOKEN
   */
  @func({ cache: "never" })
  async publishPackage(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
    ref: string,
    eventName: string,
    githubToken: Secret,
    repoOwner: string,
    repoName: string,
    inputBranch?: string,
    releasePrNumber?: number,
    registryScope?: string,
  ): Promise<string> {
    return publishPackage({
      source,
      ref,
      eventName,
      inputBranch,
      releasePrNumber,
      githubToken,
      repoOwner,
      repoName,
      registryScope,
    });
  }
}
