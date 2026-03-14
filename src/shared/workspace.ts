import { Container, Directory, Secret } from "@dagger.io/dagger";
import { resolveNodeAuthToken } from "./auth.js";
import { createBaseNodeContainer, withNpmCache, withPlaywrightCache } from "./container.js";
import { withInstalledDependencies, withLockfilesOnly, withNpmAuth } from "./npm.js";
import type { NodeWorkspaceOptions } from "./types.js";

export function createNodeWorkspace(
  source: Directory,
  nodeAuthToken: Secret | undefined,
  options: NodeWorkspaceOptions = {},
): Container {
  const resolvedNodeAuthToken = resolveNodeAuthToken(nodeAuthToken);
  let container = createBaseNodeContainer({
    workspace: options.workspace,
  });

  container = withNpmCache(container);

  if (options.withPlaywrightCache !== false) {
    container = withPlaywrightCache(container);
  }

  container = withLockfilesOnly(container, source, {
    packagePaths: options.packagePaths,
    workspace: options.workspace,
  });
  container = withNpmAuth(container, resolvedNodeAuthToken, {
    registryScope: options.registryScope,
    npmrcPaths: options.npmrcPaths ?? options.packagePaths ?? ".",
    workspace: options.workspace,
  });

  return withInstalledDependencies(container, options.packagePaths ?? ".", {
    workspace: options.workspace,
    npmCiArgs: options.npmCiArgs,
  });
}
