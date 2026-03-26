import { Container, Directory, Secret } from "@dagger.io/dagger";
import { maybeResolveNodeAuthToken } from "./auth.js";
import { createBaseNodeContainer, withNpmCache, withPlaywrightCache } from "./container.js";
import { withFullSource, withInstalledDependencies, withLockfilesOnly, withNpmAuth } from "./npm.js";
import type { NodeWorkspaceOptions } from "./types.js";

export function createNodeWorkspace(
  source: Directory,
  nodeAuthToken: Secret | undefined,
  options: NodeWorkspaceOptions = {},
): Container {
  const resolvedNodeAuthToken = maybeResolveNodeAuthToken(nodeAuthToken);
  let container = createBaseNodeContainer({
    workspace: options.workspace,
  });

  if (options.withPlaywrightCache !== false) {
    container = withPlaywrightCache(container);
  }

  container = withLockfilesOnly(container, source, {
    packagePaths: options.packagePaths,
    workspace: options.workspace,
  });

  if (resolvedNodeAuthToken) {
    container = withNpmAuth(container, resolvedNodeAuthToken, {
      registryScope: options.registryScope,
      npmrcPaths: options.npmrcPaths ?? options.packagePaths ?? ".",
      workspace: options.workspace,
    });
  }

  const installed = withInstalledDependencies(container, options.packagePaths ?? ".", {
    workspace: options.workspace,
    npmCiArgs: options.npmCiArgs,
  });

  return withFullSource(installed, source, {
    workspace: options.workspace,
    strategy: "overlay",
  });
}
