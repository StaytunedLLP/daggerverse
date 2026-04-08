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
import {
  buildInternalSelectorProgram,
  listTestsSelectorMode,
} from "./affected/affected-tests.js";
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

function shouldSkipReferenceChecksFromEnv(): boolean {
  const raw = process.env.SKIP_REFERENCE_CHECKS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
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

  let affectedSelector = "";
  if (options.runAffected ?? false) {
    const program = buildInternalSelectorProgram(
      options.base ?? "origin/main",
      listTestsSelectorMode,
    );
    const runContainer = container
      .withEnvVariable("STAYTUNED_AFFECTED_RUNTIME_EXECUTE", "1")
      .withEnvVariable("CHANGED_FILES", options.changedFiles ?? "")
      .withNewFile("/tmp/affected-selector.ts", program)
      .withExec(["node", "--experimental-strip-types", "/tmp/affected-selector.ts"]);
    affectedSelector = (await runContainer.stdout()).trim();

    if (options.listOnly ?? false) {
      return affectedSelector;
    }

    if (affectedSelector.length === 0) {
      return "No affected tests detected";
    }
  }

  if (options.runBuild ?? true) {
    const shouldSkip =
      (options.skipReferenceChecks ?? false) ||
      shouldSkipReferenceChecksFromEnv();
    const buildCommand = shouldSkip ? "build:copilot" : "build";

    container = runNpmScript(container, buildCommand, {
      cwd: packagePath,
    });
  }

  let args: string[] = [];
  if (options.runAffected) {
    if (affectedSelector) {
      args = affectedSelector.split(/\s+/).filter((value) => value.length > 0);
    }
  } else if (options.testSelector) {
    args = [options.testSelector];
  }
  container = runNpmScript(container, options.testScript ?? "test:e2e", {
    cwd: packagePath,
    args,
  });

  return container.stdout();
}

export type { PlaywrightTestOptions };
