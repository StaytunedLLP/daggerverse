import {
  Container,
  Directory,
  Secret,
  argument,
  check,
  func,
  object,
} from "@dagger.io/dagger";
import {
  deleteFirebaseApphostingBackend,
  deployFirebaseApphostingProject,
} from "./firebase/app-hosting.js";
import { firebaseAppHostingBase } from "./firebase/base.js";
import { runNodeChecks } from "./checks/node-checks.js";
import { prepareNodeWorkspace } from "./copilot/prepare-node-workspace.js";
import { firebaseDeployWebhostingPipeline } from "./firebase/pipeline.js";
import {
  gitDiffBetweenCommits,
  gitDiffPrevious,
  gitDiffStaged,
} from "./git/index.js";
import { publishPackage } from "./publish/index.js";
import { runPlaywrightTests } from "./playwright/index.js";

type CheckMode = "format" | "lint" | "build" | "test";

/**
 * Collection of repository checks and validation tools.
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
   * Install Node dependencies and optionally provision Playwright and Firebase tooling.
   *
   * @param source - Repository source directory to install into the workspace container.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root where npm installs should run.
   * @param playwrightInstall - When true, installs Playwright system dependencies and Chromium into the prepared workspace.
   * @param firebaseTools - When true, installs Firebase CLI tooling in the prepared workspace container.
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
   * Run the repository formatting check with `npm run format:check`.
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
   * Run the repository linter with `npm run lint`.
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
   * Run the repository build with `npm run build`.
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
   * Run the repository test suite with `npm run test`.
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

  /**
   * Run Playwright E2E tests for a package inside the provided source tree.
   *
   * @param source - Repository source directory containing Playwright tests.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root. The first path is used for build/test execution.
   * @param testSelector - Optional selector/path passed to the npm test script using `--`.
   * @param testScript - Npm script to run for tests. Defaults to `test:e2e`.
   * @param runBuild - When true, runs `npm run build` before executing tests.
   * @param registryScope - GitHub Packages scope used when authenticating npm.
   * @param browsers - Browser list for Playwright install commands, as a comma-separated string.
   * @param runAffected - When true, resolves affected tests from git diff and runs only those selectors.
   * @param base - Base ref used by affected discovery when `runAffected` is enabled.
   * @param listOnly - When true with `runAffected`, returns discovered selectors without running build/tests.
   * @param changedFiles - Optional whitespace/comma-separated file list used instead of git diff in affected discovery.
   *
   * @example
   * dagger call checks test-playwright --source . --package-paths "apps/web"
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
}

/**
 * Shared Dagger module for Node/TypeScript repository checks and deployment helpers.
 */
@object()
export class StaydevopsTs {
  /**
   * Returns a Firebase App Hosting base container with firebase-tools installed and cached.
   */
  private base(): Container {
    return firebaseAppHostingBase();
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
   * Retrieves an array of changed files based on the specified mode.
   *
   * @param source - The source directory to check for changed files.
   * @param mode - The diff mode to use: 'staged', 'previous', or 'between'.
   * @param commitRange - A string specifying the range of commits (required for 'between' mode).
   *
   * @example
   * dagger call git-diff --source . --mode staged
   *
   * @example
   * dagger call git-diff --source . --mode previous
   *
   * @example
   * dagger call git-diff --source . --mode between --commit-range "HEAD~2..HEAD"
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
   * Performs actions on Firebase App Hosting backends.
   *
   * @param action - The action to perform: 'deploy' or 'delete'.
   * @param projectId - Firebase project ID used for deployment.
   * @param backendId - Firebase App Hosting backend identifier.
   * @param source - Repository source directory containing the application to deploy (required for deploy).
   * @param rootDir - Application root directory inside the source tree (deploy only).
   * @param appId - Optional Firebase app ID used when creating a backend (deploy only).
   * @param region - Firebase App Hosting region (deploy only).
   * @param gcpCredentials - Optional GCP service account secret.
   * @param wifProvider - Workload Identity Federation provider resource name (deploy only).
   * @param wifServiceAccount - Workload Identity Federation service account email (deploy only).
   * @param wifOidcToken - Optional OIDC token secret for WIF authentication (deploy only).
   * @param wifAudience - Optional WIF audience override (deploy only).
   *
   * @example
   * dagger call fb-apphosting --action deploy --source . --project-id "my-project" --backend-id "backend-id"
   *
   * @example
   * dagger call fb-apphosting --action delete --project-id "my-project" --backend-id "backend-id"
   */
  @func()
  async fbApphosting(
    action: string,
    projectId: string,
    backendId: string,
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source?: Directory,
    rootDir = ".",
    appId = "",
    region = "asia-southeast1",
    gcpCredentials?: Secret,
    wifProvider = "",
    wifServiceAccount = "",
    wifOidcToken?: Secret,
    wifAudience = "",
  ): Promise<string> {
    if (action === "deploy") {
      if (!source) {
        throw new Error("source is required for 'deploy' action");
      }
      return deployFirebaseApphostingProject(
        source,
        projectId,
        backendId,
        rootDir,
        appId,
        region,
        gcpCredentials,
        wifProvider,
        wifServiceAccount,
        wifOidcToken,
        wifAudience,
      );
    }

    if (action === "delete") {
      return deleteFirebaseApphostingBackend(
        projectId,
        backendId,
        gcpCredentials,
        wifProvider,
        wifServiceAccount,
        wifOidcToken,
        wifAudience,
      );
    }

    throw new Error("Unsupported action");
  }

  /**
   * Build and deploy a Firebase web hosting project from the provided source tree.
   *
   * @param source - Repository source directory containing the Firebase project and any frontend or backend packages.
   * @param projectId - Firebase project ID used for the deploy command and frontend environment generation.
   * @param gcpCredentials - GCP service account JSON secret used for Firebase deployment authentication.
   * @param appId - Optional Firebase app ID to inject into frontend environment variables before building.
   * @param only - Optional Firebase deploy target selector passed to `firebase deploy --only`.
   * @param frontendDir - Optional frontend package directory to build before deployment, relative to the source root.
   * @param backendDir - Optional backend or secondary package directory whose dependencies should be installed before deployment.
   * @param firebaseDir - Optional directory containing `firebase.json`. Defaults to the workspace root.
   * @param webappConfig - Optional secret containing Firebase web app config JSON to write into frontend environment variables.
   * @param extraEnv - Optional secret containing extra `.env` lines appended before the frontend build runs.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when frontend or backend installs private npm packages.
   *
   * @example
   * dagger call fb-webhosting --source . --project-id "my-firebase-project" --gcp-credentials env:GCP_CREDENTIALS
   */
  @func({ cache: "never" })
  async fbWebhosting(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
    projectId: string,
    gcpCredentials: Secret,
    appId?: string,
    only?: string,
    frontendDir?: string,
    backendDir?: string,
    firebaseDir?: string,
    webappConfig?: Secret,
    extraEnv?: Secret,
    nodeAuthToken?: Secret,
  ): Promise<string> {
    return firebaseDeployWebhostingPipeline(source, projectId, gcpCredentials, {
      appId,
      frontendDir,
      backendDir,
      firebaseDir,
      only,
      webappConfig,
      extraEnv,
      nodeAuthToken,
    });
  }

  /**
   * Deterministic package publishing logic for npm packages.
   * For merged release PRs, this also creates the GitHub Release after publishing the npm package and can finalize release labels.
   *
   * @param source - Repository source directory to publish from.
   * @param ref - Git ref triggering the workflow (e.g. refs/tags/v1.2.3 for release events).
   * @param eventName - GitHub event name (allowed: release, workflow_dispatch).
   * @param githubToken - GitHub PAT for npm authentication and PR validation.
   * @param repoOwner - Repository owner (e.g. StaytunedLLP).
   * @param repoName - Repository name (e.g. devops).
   * @param inputBranch - Manual branch input provided for workflow_dispatch.
   * @param releasePrNumber - Release PR number to finalize after publishing a merged release commit.
   * @param registryScope - The scope of the npm package (e.g. staytunedllp).
   *
   * @example
   * dagger call publish-package --source . --ref "refs/tags/v1.2.3" --event-name "release" --github-token env:GITHUB_TOKEN --repo-owner "StaytunedLLP" --repo-name "devops"
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
