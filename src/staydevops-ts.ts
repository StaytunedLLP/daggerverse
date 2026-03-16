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
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  /**
   * Run the repository linter with `npm run lint`.
   */
  @check()
  async lint(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  /**
   * Run the repository build with `npm run build`.
   */
  @check()
  async build(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  /**
   * Run the repository test suite with `npm run test`.
   */
  @check()
  async test(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }

  /**
   * Validate that `chromium-bidi` is installed in the selected package path.
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
   */
  @func()
  async prepareNodeWorkspace(
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
    playwrightInstall = false,
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
