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
  base?: string,
): string {
  const baseArg = base ? ` --base=${shellQuote(base)}` : "";
  const runCmd = `if node -e "const pkg=require('./package.json'); process.exit(pkg.dependencies?.['@staytunedllp/staystack'] || pkg.devDependencies?.['@staytunedllp/staystack'] ? 0 : 1)" 2>/dev/null; then\n  npx staystack staytest run --incremental${baseArg}\nelif node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.['verify:incremental'] ? 0 : 1)" 2>/dev/null; then\n  npm run verify:incremental\nelif node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.['test:incremental'] ? 0 : 1)" 2>/dev/null; then\n  npm run test:incremental\nelse\n  echo "No staystack CLI or incremental test script found; skipping incremental DAG tests."\nfi`;

  return [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
    `export NPM_CONFIG_USERCONFIG=${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, ".npmrc"))}`,
    `test -d .git || { echo "Missing git metadata required for incremental testing." >&2; exit 1; }`,
    `echo "Running incremental staytest DAG with git metadata available."`,
    "git status --short --branch",
    "if [ -f .staystack/package.json ]; then",
    "  mkdir -p .staystack/node_modules/@staytunedllp",
    "  ln -sfn /workspace .staystack/node_modules/@staytunedllp/staystack",
    "fi",
    runCmd,
  ].join("\n");
}

function buildRunIfScriptExistsScript(scriptName: string): string {
  return [
    `if node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.[${JSON.stringify(scriptName)}] ? 0 : 1)" 2>/dev/null; then`,
    `  npm run ${scriptName}`,
    "else",
    `  echo "No ${scriptName} script found; skipping."`,
    "fi",
  ].join("\n");
}

function buildRunFirstExistingScriptScript(scriptNames: readonly string[]): string {
  const lines = ["ran_script=false"];

  for (const scriptName of scriptNames) {
    lines.push(
      `if [ "$ran_script" = "false" ] && node -e "const pkg=require('./package.json'); process.exit(pkg.scripts?.[${JSON.stringify(scriptName)}] ? 0 : 1)" 2>/dev/null; then`,
      `  npm run ${scriptName}`,
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

function buildProfileScript(
  packagePath: string,
  profile: NonNullable<NodeChecksOptions["profile"]>,
  base?: string,
): string {
  const cwd = resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath);
  const lines = [
    STRICT_SHELL_HEADER,
    `cd ${shellQuote(cwd)}`,
    `export NPM_CONFIG_USERCONFIG=${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, ".npmrc"))}`,
    `echo "Running Dagger ${profile} profile in ${shellQuote(packagePath)}."`,
  ];

  if (profile === "pr") {
    lines.push(
      buildRunIfScriptExistsScript("format:check"),
      buildRunIfScriptExistsScript("lint"),
      buildStaytestOrFallbackScript(packagePath, "incremental", base),
    );
    return lines.join("\n");
  }

  if (profile === "main") {
    lines.push(
      buildRunIfScriptExistsScript("format:check"),
      buildRunIfScriptExistsScript("lint"),
      buildRunFirstExistingScriptScript(["build:ci", "build"]),
      buildStaytestOrFallbackScript(packagePath, "incremental", base),
    );
    return lines.join("\n");
  }

  if (profile === "nightly") {
    lines.push(
      buildRunIfScriptExistsScript("format:check"),
      buildRunIfScriptExistsScript("lint"),
      buildRunFirstExistingScriptScript(["build:ci", "build"]),
      buildStaytestOrFallbackScript(packagePath, "nightly", base, true),
    );
    return lines.join("\n");
  }

  lines.push(
    buildRunIfScriptExistsScript("format:check"),
    buildRunIfScriptExistsScript("lint"),
    buildRunFirstExistingScriptScript(["ci", "build:ci", "build"]),
    buildStaytestOrFallbackScript(packagePath, "nightly", base, true),
  );
  return lines.join("\n");
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

  const needsGitMetadata =
    options.runAffected || options.profile === "pr" || options.profile === "main";

  let workspace = withFullSource(installed, source, {
    exclude: needsGitMetadata
      ? DEFAULT_SOURCE_EXCLUDES.filter((entry) => entry !== ".git")
      : DEFAULT_SOURCE_EXCLUDES,
  });

  for (const packagePath of packagePaths) {
    if (options.profile) {
      workspace = workspace.withExec([
        "bash",
        "-lc",
        buildProfileScript(packagePath, options.profile, options.base),
      ]);
      continue;
    }

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
