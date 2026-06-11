import { Directory, Secret } from "@dagger.io/dagger";
import {
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
  createNodeWorkspace,
  runNpmScript,
  withFullSource,
} from "../shared/index.js";
import { normalizePaths, resolveWorkspacePath, shellQuote } from "../shared/path-utils.js";
import type { NodeChecksOptions } from "./types.js";

function buildVerifyScript(
  packagePaths: string[],
  verifyChromiumBidi: boolean,
): string {
  if (!verifyChromiumBidi || packagePaths.length === 0) {
    return STRICT_SHELL_HEADER;
  }

  return [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePaths[0]))}`,
    "npm ls chromium-bidi --depth=0",
  ].join("\n");
}

export async function runNodeChecks(
  source: Directory,
  nodeAuthToken?: Secret,
  options: NodeChecksOptions = {},
): Promise<string> {
  const packagePaths = normalizePaths(options.packagePaths);
  let installed = createNodeWorkspace(source, nodeAuthToken, {
    packagePaths,
    registryScope: options.registryScope,
    withPlaywrightCache: false,
  });

  if (options.verifyChromiumBidi) {
    installed = installed.withExec([
      "bash",
      "-lc",
      buildVerifyScript(packagePaths, true),
    ]);
  }

  let workspace = withFullSource(installed, source, {
    exclude: DEFAULT_SOURCE_EXCLUDES,
  });

  const tasks: Promise<string>[] = [];

  for (const packagePath of packagePaths) {
    if (options.format) {
      tasks.push(runNpmScript(workspace, "format:check", { cwd: packagePath }).stdout());
    }

    if (options.lint) {
      tasks.push(runNpmScript(workspace, "lint", { cwd: packagePath }).stdout());
    }

    if (options.test) {
      tasks.push(runNpmScript(workspace, "test", { cwd: packagePath }).stdout());
    }

    if (options.build) {
      tasks.push(runNpmScript(workspace, "build", { cwd: packagePath }).stdout());
    }
  }

  if (tasks.length > 0) {
    const results = await Promise.all(tasks);
    return results.join("\n");
  }

  return workspace.stdout();
}

