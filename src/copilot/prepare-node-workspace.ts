import { Directory, Secret } from "@dagger.io/dagger";
import {
  DEFAULT_PLAYWRIGHT_BROWSERS,
  DEFAULT_WORKSPACE,
  createNodeWorkspace,
  withFullSource,
  withPlaywrightBrowsers,
  withPlaywrightSystemDeps,
} from "../shared/index.js";
import { normalizePaths } from "../shared/path-utils.js";
import { withFirebaseTooling } from "./tooling.js";
import type { CopilotWorkspaceOptions } from "./types.js";

export function prepareNodeWorkspace(
  source: Directory,
  nodeAuthToken?: Secret,
  options: CopilotWorkspaceOptions = {},
): Directory {
  const packagePaths = normalizePaths(options.packagePaths);

  let container = createNodeWorkspace(source, nodeAuthToken, {
    packagePaths,
    registryScope: options.registryScope,
    withPlaywrightCache: true,
  });

  if (options.firebaseTools) {
    container = withFirebaseTooling(container);
  }

  if (options.playwrightInstall) {
    container = withPlaywrightSystemDeps(container, {
      cwd: packagePaths[0] ?? ".",
      browsers: DEFAULT_PLAYWRIGHT_BROWSERS,
    });
    container = withPlaywrightBrowsers(container, {
      cwd: packagePaths[0] ?? ".",
      browsers: DEFAULT_PLAYWRIGHT_BROWSERS,
    });
  }

  return container.directory(DEFAULT_WORKSPACE);
}
