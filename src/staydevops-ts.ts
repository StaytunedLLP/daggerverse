import {
  Directory,
  Secret,
  argument,
  check,
  func,
  object,
} from "@dagger.io/dagger";
import { runNodeChecks } from "./checks/node-checks.js";
import { prepareNodeWorkspace } from "./copilot/prepare-node-workspace.js";
import { firebaseDeployWebhostingPipeline } from "./firebase/pipeline.js";
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
   */
  @check()
  async format(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
      description: "Repository source directory to validate.",
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  /**
   * Run the repository linter with `npm run lint`.
   */
  @check()
  async lint(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
      description: "Repository source directory to lint.",
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  /**
   * Run the repository build with `npm run build`.
   */
  @check()
  async build(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
      description: "Repository source directory to build.",
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  /**
   * Run the repository test suite with `npm run test`.
   */
  @check()
  async test(
    @argument({
      defaultPath: ".",
      ignore: DEFAULT_SOURCE_EXCLUDES,
      description: "Repository source directory to test.",
    })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }

  /**
   * Validate that `chromium-bidi` is installed in the selected package path.
   */
  @func()
  async verifyChromiumBidi(
    @argument({
      description: "Repository source directory that contains the package to inspect.",
    })
    source: Directory,
    @argument({
      description:
        "Optional GitHub Packages token secret. Required only when installing private npm packages.",
    })
    nodeAuthToken?: Secret,
    @argument({
      description:
        "Package path or comma-separated package paths relative to the source root. The first path is used for the chromium-bidi check.",
    })
    packagePaths = ".",
  ): Promise<string> {
    return runNodeChecks(source, nodeAuthToken, {
      packagePaths,
      verifyChromiumBidi: true,
    });
  }

  /**
   * Install Node dependencies and optionally provision Playwright and Firebase tooling.
   */
  @func()
  async prepareNodeWorkspace(
    @argument({
      description: "Repository source directory to install into the workspace container.",
    })
    source: Directory,
    @argument({
      description:
        "Optional GitHub Packages token secret. Required only when installing private npm packages.",
    })
    nodeAuthToken?: Secret,
    @argument({
      description:
        "Package path or comma-separated package paths relative to the source root where npm installs should run.",
    })
    packagePaths = ".",
    @argument({
      description:
        "When true, installs Playwright system dependencies and Chromium into the prepared workspace.",
    })
    playwrightInstall = false,
    @argument({
      description:
        "When true, installs Firebase CLI tooling in the prepared workspace container.",
    })
    firebaseTools = false,
  ): Promise<string> {
    return prepareNodeWorkspace(source, nodeAuthToken, {
      packagePaths,
      playwrightInstall,
      firebaseTools,
    });
  }

  /**
   * Build and deploy a Firebase web hosting project from the provided source tree.
   */
  @func({ cache: "never" })
  async deployWebhosting(
    @argument({
      description:
        "Repository source directory containing the Firebase project and any frontend or backend packages.",
    })
    source: Directory,
    @argument({
      description: "Firebase project ID used for the deploy command and frontend environment generation.",
    })
    projectId: string,
    @argument({
      description:
        "GCP service account JSON secret used for Firebase deployment authentication.",
    })
    gcpCredentials: Secret,
    @argument({
      description:
        "Optional Firebase app ID to inject into frontend environment variables before building.",
    })
    appId?: string,
    @argument({
      description:
        "Optional Firebase deploy target selector passed to `firebase deploy --only`.",
    })
    only?: string,
    @argument({
      description:
        "Optional frontend package directory to build before deployment, relative to the source root.",
    })
    frontendDir?: string,
    @argument({
      description:
        "Optional backend or secondary package directory whose dependencies should be installed before deployment.",
    })
    backendDir?: string,
    @argument({
      description:
        "Optional directory containing `firebase.json`. Defaults to the workspace root.",
    })
    firebaseDir?: string,
    @argument({
      description:
        "Optional secret containing Firebase web app config JSON to write into frontend environment variables.",
    })
    webappConfig?: Secret,
    @argument({
      description:
        "Optional secret containing extra `.env` lines appended before the frontend build runs.",
    })
    extraEnv?: Secret,
    @argument({
      description:
        "Optional GitHub Packages token secret. Required only when frontend or backend installs private npm packages.",
    })
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
