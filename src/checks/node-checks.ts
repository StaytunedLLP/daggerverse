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
import { Directory, Secret } from "@dagger.io/dagger";
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
  base?: string,
): string {
  const baseArg = base ? ` --base=${shellQuote(base)}` : "";
  const runCmd = `if node -e "const pkg=require('./package.json'); process.exit(pkg.dependencies?.['@staytunedllp/staystack'] || pkg.devDependencies?.['@staytunedllp/staystack'] ? 0 : 1)" 2>/dev/null; then\n  npx staystack staytest run --incremental${baseArg}\nelif node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.['verify:incremental'] ? 0 : 1)" 2>/dev/null; then\n  npm run verify:incremental\nelif node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.['test:incremental'] ? 0 : 1)" 2>/dev/null; then\n  npm run test:incremental\nelse\n  echo "Missing incremental test script (verify:incremental or test:incremental) in package.json" >&2\n  exit 1\nfi`;

  return [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
    `export NPM_CONFIG_USERCONFIG=${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, ".npmrc"))}`,
    `test -d .git || { echo "Missing git metadata required for incremental testing." >&2; exit 1; }`,
    `echo "Running incremental staytest DAG with git metadata available."`,
    "git status --short --branch",
    runCmd,
  ].join("\n");
}

function buildRunIfScriptExistsScript(scriptName: string): string {
  const scriptProbe = shellQuote(
    `const pkg=require('./package.json'); process.exit(pkg.scripts?.[${JSON.stringify(scriptName)}] ? 0 : 1)`,
  );

  return [
    `if node -e ${scriptProbe} 2>/dev/null; then`,
    `  npm run ${shellQuote(scriptName)}`,
    "else",
    `  echo "No ${scriptName} script found; skipping."`,
    "fi",
  ].join("\n");
}

function buildRunFirstExistingScriptScript(scriptNames: readonly string[]): string {
  const lines = ["ran_script=false"];

  for (const scriptName of scriptNames) {
    const scriptProbe = shellQuote(
      `const pkg=require('./package.json'); process.exit(pkg.scripts?.[${JSON.stringify(scriptName)}] ? 0 : 1)`,
    );

    lines.push(
      `if [ "$ran_script" = "false" ] && node -e ${scriptProbe} 2>/dev/null; then`,
      `  npm run ${shellQuote(scriptName)}`,
      "  ran_script=true",
      "fi",
    );
  }

  lines.push(
    `if [ "$ran_script" = "false" ]; then`,
    `  echo "None of these npm scripts exist; skipping: ${scriptNames.join(", ")}"`,
    "fi",
  );

  return lines.join("\n");
}

function buildStaytestOrFallbackScript(
  packagePath: string,
  mode: "incremental" | "nightly",
  base?: string,
  coverage = false,
): string {
  const baseArg = mode === "incremental" && base ? ` --base=${shellQuote(base)}` : "";
  const coverageArg = coverage ? " --coverage" : "";
  const staytestArgs = mode === "incremental"
    ? `--incremental${baseArg}${coverageArg}`
    : `--nightly${coverageArg}`;

  if (mode === "incremental") {
    return buildRunAffectedTestScript(packagePath, base);
  }

  return [
    `if node -e "const pkg=require('./package.json'); process.exit(pkg.dependencies?.['@staytunedllp/staystack'] || pkg.devDependencies?.['@staytunedllp/staystack'] ? 0 : 1)" 2>/dev/null; then`,
    `  npx staystack staytest run ${staytestArgs}`,
    "else",
    buildRunFirstExistingScriptScript(["nightly:test", "test"]),
    "fi",
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

  const needsGitMetadata = Boolean(options.runAffected);

  let workspace = withFullSource(installed, source, {
    exclude: needsGitMetadata
      ? DEFAULT_SOURCE_EXCLUDES.filter((entry) => entry !== ".git")
      : DEFAULT_SOURCE_EXCLUDES,
  });

  for (const packagePath of packagePaths) {
    if (options.format) {
      if (options.runAffected) {
        workspace = runNpmScript(workspace, "format:incremental", { cwd: packagePath });
      } else {
        workspace = runNpmScript(workspace, "format:check", { cwd: packagePath });
      }
    }

    if (options.lint) {
      if (options.runAffected) {
        workspace = runNpmScript(workspace, "lint:incremental", { cwd: packagePath });
      } else {
        workspace = runNpmScript(workspace, "lint", { cwd: packagePath });
      }
    }

    if (options.test) {
      if (options.runAffected) {
        workspace = workspace.withExec([
          "bash",
          "-lc",
          buildRunAffectedTestScript(
            packagePath,
            options.base,
          ),
        ]);
      } else {
        workspace = runNpmScript(workspace, "test", { cwd: packagePath });
      }
    }

    if (options.build) {
      if (options.runAffected) {
        workspace = runNpmScript(workspace, "build:incremental", { cwd: packagePath });
      } else {
        workspace = runNpmScript(workspace, "build:ci", { cwd: packagePath });
      }
    }
  }

  return workspace.stdout();
}
