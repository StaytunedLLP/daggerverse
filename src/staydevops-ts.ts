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
import { runNodeChecks } from "./checks/node-checks.js";
import { prepareNodeWorkspace } from "./copilot/prepare-node-workspace.js";
import { firebaseDeployWebhostingPipeline } from "./firebase/pipeline.js";
import {
  gitDiffBetweenCommits,
  gitDiffPrevious,
  gitDiffStaged,
} from "./git/index.js";
import { runPlaywrightTests } from "./playwright/index.js";
import { DEFAULT_SOURCE_EXCLUDES } from "./shared/constants.js";

type CheckMode = "format" | "lint" | "build" | "test";

function requireSource(source?: Directory): Directory {
  if (!source) {
    throw new Error("source is required");
  }

  return source;
}

/**
 * Shared Dagger module for Node/TypeScript repository checks and deployment helpers.
 */
@object()
export class StaydevopsTs {
  private async runDefaultCheck(
    source: Directory | undefined,
    mode: CheckMode,
  ): Promise<void> {
    await runNodeChecks(requireSource(source), undefined, {
      [mode]: true,
    });
  }

  /**
   * Run the repository formatting check with `npm run format:check`.
   *
   * @param source - Repository source directory to validate.
   *
   * @example
   * dagger call format --source .
   */
  @check()
  @func()
  async format(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  /**
   * Retrieves an array of files that are staged for commit.
   *
   * @param source - The source directory to check for staged files.
   *
   * @example
   * dagger call git-diff-staged --source .
   */
  @func()
  async gitDiffStaged(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
  ): Promise<string[]> {
    return gitDiffStaged(source);
  }

  /**
   * Retrieves an array of files from the previous commit.
   *
   * @param source - The source directory to check for files in the previous commit.
   *
   * @example
   * dagger call git-diff-previous --source .
   */
  @func()
  async gitDiffPrevious(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
  ): Promise<string[]> {
    return gitDiffPrevious(source);
  }

  /**
   * Retrieves an array of files that have changed between two commits.
   *
   * @param source - The source directory to check for files in the commit range.
   * @param commitRange - A string specifying the range of commits.
   *
   * @example
   * dagger call git-diff-between-commits --source . --commit-range "HEAD~2..HEAD"
   */
  @func()
  async gitDiffBetweenCommits(
    @argument({ defaultPath: ".", ignore: ["dagger", "dist", "node_modules"] })
    source: Directory,
    commitRange: string,
  ): Promise<string[]> {
    return gitDiffBetweenCommits(source, commitRange);
  }

  /**
   * Run the repository linter with `npm run lint`.
   *
   * @param source - Repository source directory to lint.
   *
   * @example
   * dagger call lint --source .
   */
  @check()
  @func()
  async lint(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  /**
   * Run the repository build with `npm run build`.
   *
   * @param source - Repository source directory to build.
   *
   * @example
   * dagger call build --source .
   */
  @check()
  @func()
  async build(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  /**
   * Run the repository test suite with `npm run test`.
   *
   * @param source - Repository source directory to test.
   *
   * @example
   * dagger call test --source .
   */
  @check()
  @func()
  async test(
    @argument({
      defaultPath: ".",
      ignore: [".git", "dagger", "dist", "node_modules"],
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }

  /**
   * Validates the PR title according to Conventional Commits naming convention.
   *
   * @param eventFile - Optional GitHub event JSON file containing the PR title.
   *
   * @example
   * dagger call check-pr-title --event-file=$GITHUB_EVENT_PATH
   */
  @check()
  @func()
  async checkPrTitle(eventFile?: File): Promise<void> {
    await checkPrTitleFromEvent(eventFile);
  }

  /**
   * Validate that `chromium-bidi` is installed in the selected package path.
   *
   * @param source - Repository source directory that contains the package to inspect.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root. The first path is used for the chromium-bidi check.
   *
   * @example
   * dagger call verify-chromium-bidi --source . --package-paths "./apps/web"
   */
  @func()
  async verifyChromiumBidi(
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
   * Install Node dependencies and optionally provision Playwright and Firebase tooling.
   *
   * @param source - Repository source directory to install into the workspace container.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root where npm installs should run.
   * @param playwrightInstall - When true, installs Playwright system dependencies and Chromium into the prepared workspace.
   * @param firebaseTools - When true, installs Firebase CLI tooling in the prepared workspace container.
   *
   * @example
   * dagger call prepare-node-workspace --source . --playwright-install
   */
  @func()
  async prepareNodeWorkspace(
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
   *
   * @example
   * dagger call playwright-test --source . --package-paths "apps/web"
   */
  @func()
  async playwrightTest(
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
    testSelector = "",
    testScript = "test:e2e",
    runBuild = true,
    registryScope = "staytunedllp",
    browsers = "chromium",
  ): Promise<string> {
    return runPlaywrightTests(source, {
      nodeAuthToken,
      packagePaths,
      testSelector,
      testScript,
      runBuild,
      registryScope,
      browsers,
    });
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
   * dagger call deploy-webhosting --source . --project-id "my-firebase-project" --gcp-credentials env:GCP_CREDENTIALS
   */
  @func({ cache: "never" })
  async deployWebhosting(
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
}
