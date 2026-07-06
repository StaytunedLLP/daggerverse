import { Directory, Secret } from "@dagger.io/dagger";
import {
  DEFAULT_SOURCE_EXCLUDES,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
  createNodeWorkspace,
  runNpmScript,
  withFullSource,
} from "#shared/index.js";
import { normalizePaths, resolveWorkspacePath, shellQuote } from "#shared/path-utils.js";
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

function buildRunAffectedTestScript(packagePath: string): string {
  return [
    STRICT_SHELL_HEADER,
    'log_file="/tmp/staystack-incremental-test.log"',
    "status=0",
    "{",
    `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
    `export NPM_CONFIG_USERCONFIG=${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, ".npmrc"))}`,
    'published="$(npm view @staytunedllp/staystack version)"',
    'installed="$(npm list -g @staytunedllp/staystack --depth=0 --json 2>/dev/null | node -e \'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { try { const parsed = JSON.parse(input); process.stdout.write(parsed.dependencies?.["@staytunedllp/staystack"]?.version ?? ""); } catch {} });\')"',
    'if node -e \'const [installed, published] = process.argv.slice(1); const parts = (value) => value.split(".").map((part) => Number.parseInt(part, 10) || 0); const older = (a, b) => { const av = parts(a); const bv = parts(b); for (let index = 0; index < Math.max(av.length, bv.length); index += 1) { if ((av[index] ?? 0) < (bv[index] ?? 0)) return true; if ((av[index] ?? 0) > (bv[index] ?? 0)) return false; } return false; }; process.exit(installed && !older(installed, published) ? 0 : 1);\' "$installed" "$published"; then',
    '  echo "staystack CLI ${installed} is current."',
    "else",
    '  echo "Installing staystack CLI ${published}."',
    "  npm install -g @staytunedllp/staystack@latest",
    "fi",
    'test -d .git || { echo "Missing git metadata required by npm run test:incremental." >&2; exit 1; }',
    'echo "Running native incremental tests with git metadata available."',
    "git status --short --branch",
    "if [ -f .staystack/package.json ]; then",
    "  mkdir -p .staystack/node_modules/@staytunedllp",
    "  ln -sfn /workspace .staystack/node_modules/@staytunedllp/staystack",
    "fi",
    "npm run test:incremental",
    '} > "${log_file}" 2>&1 || status=$?',
    'cat "${log_file}"',
    'exit "${status}"',
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
          buildRunAffectedTestScript(packagePath),
        ]);
      } else {
        let testWorkspace = workspace;
        const buildCheck = `node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(pkg.scripts && pkg.scripts.build ? 0 : 1)"`;

        testWorkspace = testWorkspace.withExec(["bash", "-lc", [
          STRICT_SHELL_HEADER,
          `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
          `if ${buildCheck} 2>/dev/null; then`,
          `  npm run build`,
          `fi`,
        ].join("\n")]);
        workspace = runNpmScript(testWorkspace, "test", {
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
