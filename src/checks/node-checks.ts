import { Directory, Secret } from "@dagger.io/dagger";
import {
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
  createNodeWorkspace,
  runNpmScript,
  withFullSource,
} from "#shared/index.js";
import {
  normalizePaths,
  resolveWorkspacePath,
  shellQuote,
} from "#shared/path-utils.js";
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

function buildRunAffectedTestScript(
  packagePath: string,
  testScript = "verify:incremental",
  base?: string,
): string {
  const baseArg = base ? ` --base=${shellQuote(base)}` : "";
  const npmBaseArg = base ? ` -- --base=${shellQuote(base)}` : "";
  const runCmd =
    testScript === "staytest" || testScript === "staytest:incremental"
      ? `npx staytest --incremental${baseArg}`
      : `if node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.['${testScript}'] ? 0 : 1)" 2>/dev/null; then\n  npm run ${testScript}${npmBaseArg}\nelse\n  npx staytest --incremental${baseArg}\nfi`;

  return [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
    `export NPM_CONFIG_USERCONFIG=${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, ".npmrc"))}`,
    `test -d .git || { echo "Missing git metadata required for incremental testing." >&2; exit 1; }`,
    `echo "Running native incremental tests with git metadata available."`,
    "git status --short --branch",
    "if [ -f .staystack/package.json ]; then",
    "  mkdir -p .staystack/node_modules/@staytunedllp",
    "  ln -sfn /workspace .staystack/node_modules/@staytunedllp/staystack",
    "fi",
    runCmd,
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
    exclude: options.runAffected
      ? DEFAULT_SOURCE_EXCLUDES.filter((entry) => entry !== ".git")
      : DEFAULT_SOURCE_EXCLUDES,
  });

  for (const packagePath of packagePaths) {
    if (options.format) {
      workspace = runNpmScript(workspace, "format:check", { cwd: packagePath });
    }

    if (options.lint) {
      workspace = runNpmScript(workspace, "lint", { cwd: packagePath });
    }

    if (options.test) {
      if (options.runAffected) {
        workspace = workspace.withExec([
          "bash",
          "-lc",
          buildRunAffectedTestScript(
            packagePath,
            options.testScript,
            options.base,
          ),
        ]);
      } else {
        let testWorkspace = workspace;
        const buildCheck = `node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(pkg.scripts && pkg.scripts.build ? 0 : 1)"`;

        testWorkspace = testWorkspace.withExec([
          "bash",
          "-lc",
          [
            STRICT_SHELL_HEADER,
            `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
            `if ${buildCheck} 2>/dev/null; then`,
            `  npm run build`,
            `fi`,
          ].join("\n"),
        ]);
        workspace = runNpmScript(testWorkspace, options.testScript ?? "test", {
          cwd: packagePath,
        });
      }
    }

    if (options.build) {
      workspace = runNpmScript(workspace, "build", { cwd: packagePath });
    }
  }

  return workspace.stdout();
}
