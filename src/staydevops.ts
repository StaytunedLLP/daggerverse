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
import { resolveNodeAuthToken } from "./shared/auth.js";

type CheckMode = "format" | "lint" | "build" | "test";

@object()
export class StaydevopsTs {
  private async runDefaultCheck(
    source: Directory,
    mode: CheckMode,
  ): Promise<void> {
    const nodeAuthToken = resolveNodeAuthToken();

    await runNodeChecks(source, nodeAuthToken, {
      [mode]: true,
    });
  }

  @check()
  async format(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  @check()
  async lint(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  @check()
  async build(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  @check()
  async test(
    @argument({ defaultPath: ".", ignore: DEFAULT_SOURCE_EXCLUDES })
    source: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }

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
