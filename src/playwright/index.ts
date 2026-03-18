import { Directory } from "@dagger.io/dagger";
import {
  DEFAULT_PLAYWRIGHT_BROWSERS,
  DEFAULT_REGISTRY_SCOPE,
  createNodeWorkspace,
  runNpmScript,
  withFullSource,
  withPlaywrightBrowsers,
  withPlaywrightSystemDeps,
} from "../shared/index.js";
import { normalizePaths } from "../shared/path-utils.js";
import type { PlaywrightTestOptions } from "./types.js";

function normalizeBrowsers(browsers?: string): string[] {
  if (!browsers) {
    return DEFAULT_PLAYWRIGHT_BROWSERS;
  }

  const normalized = browsers
    .split(",")
    .map((browser) => browser.trim())
    .filter((browser) => browser.length > 0);

  return normalized.length > 0 ? normalized : DEFAULT_PLAYWRIGHT_BROWSERS;
}

export async function runPlaywrightTests(
  source: Directory,
  options: PlaywrightTestOptions = {},
): Promise<string> {
  const packagePaths = normalizePaths(options.packagePaths);
  const packagePath = packagePaths[0] ?? ".";

  let container = createNodeWorkspace(source, options.nodeAuthToken, {
    packagePaths,
    registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    withPlaywrightCache: true,
  });

  const browsers = normalizeBrowsers(options.browsers);
  container = withPlaywrightSystemDeps(container, {
    cwd: packagePath,
    browsers,
  });
  container = withPlaywrightBrowsers(container, {
    cwd: packagePath,
    browsers,
  });

  container = withFullSource(container, source, { strategy: "overlay" });

  if (options.runBuild ?? true) {
    container = runNpmScript(container, "build", {
      cwd: packagePath,
    });
  }

  container = runNpmScript(container, options.testScript ?? "test:e2e", {
    cwd: packagePath,
    args: options.testSelector ? [options.testSelector] : [],
  });

  return container.stdout();
}

export type { PlaywrightTestOptions };
