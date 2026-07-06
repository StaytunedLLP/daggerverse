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
import { buildInternalSelectorProgram } from "./affected-node-tests.js";
import type { NodeChecksOptions } from "./types.js";

const STAYTUNED_AFFECTED_BUILD_BUILDER = `
const fs = require('fs');
const path = require('path');
const files = JSON.parse(process.env.STAYTUNED_AFFECTED_TEST_FILES_JSON);
const configs = new Set();
for (const file of files) {
  let dir = path.dirname(file);
  while (dir !== '.' && dir !== '/' && dir !== '') {
    const testJson = path.join(dir, 'tsconfig.test.json');
    const normalJson = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(testJson)) {
      configs.add(testJson);
      break;
    }
    if (fs.existsSync(normalJson)) {
      configs.add(normalJson);
      break;
    }
    dir = path.dirname(dir);
  }
}
if (configs.size > 0) {
  const cmd = 'npx tsgo --build ' + Array.from(configs).join(' ');
  console.log('Building affected configs:', cmd);
  require('child_process').execSync(cmd, { stdio: 'inherit' });
} else {
  console.log('No specific tsconfig files found, falling back to npm run build');
  if (fs.existsSync('package.json')) {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.scripts && pkg.scripts.build) {
      require('child_process').execSync('npm run build', { stdio: 'inherit' });
    }
  }
}
`;

function replaceTestScript(script: string, affectedFiles: string[]): string {
  const targetRegex = /([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*)\/\*\*\/[a-zA-Z0-9_*.-]+\.([a-zA-Z0-9]+)/g;
  let match;
  const targets: Array<{ raw: string; dir: string; ext: string }> = [];
  while ((match = targetRegex.exec(script)) !== null) {
    targets.push({
      raw: match[0],
      dir: match[1],
      ext: match[2]
    });
  }

  if (targets.length > 0) {
    const target = targets.find(t => t.dir !== "src") || targets[0];
    const mappedFiles = affectedFiles.map(f => {
      const clean = f.startsWith("'") && f.endsWith("'") ? f.slice(1, -1) : f;
      if (clean.startsWith("src/") && target.dir !== "src") {
        const relativePart = clean.slice(4);
        const mappedPath = target.dir + "/" + relativePart.replace(/\.ts$/, "." + target.ext).replace(/\.js$/, "." + target.ext);
        return "'" + mappedPath + "'";
      }
      return f;
    }).join(" ");

    let replaced = false;
    let replacedScript = script;
    for (const t of targets) {
      const targetStr = t.raw;
      const index = replacedScript.indexOf(targetStr);
      if (index !== -1) {
        const prevChar = replacedScript[index - 1];
        const nextChar = replacedScript[index + targetStr.length];
        const isQuote = prevChar === nextChar && ["'", '"', '`'].includes(prevChar);

        if (isQuote) {
          const quoted = prevChar + targetStr + nextChar;
          replacedScript = replacedScript.replace(quoted, () => {
            if (!replaced) {
              replaced = true;
              return mappedFiles;
            }
            return "";
          });
        } else {
          replacedScript = replacedScript.replace(targetStr, () => {
            if (!replaced) {
              replaced = true;
              return mappedFiles;
            }
            return "";
          });
        }
      }
    }
    return replacedScript;
  }

  const quotedArgs = affectedFiles.map(f => f.startsWith("'") && f.endsWith("'") ? f : `'${f}'`).join(" ");
  return script.replace(/['"`]?src\/\*\*\/[^'"`\s]+['"`]?/g, quotedArgs);
}

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

  for (const packagePath of packagePaths) {
    if (options.format) {
      workspace = runNpmScript(workspace, "format:check", { cwd: packagePath });
    }

    if (options.lint) {
      workspace = runNpmScript(workspace, "lint", { cwd: packagePath });
    }

    if (options.test) {
      let args: string[] = [];
      let skipTests = false;

      if (options.runAffected) {
        const program = buildInternalSelectorProgram(
          options.base ?? "origin/main",
        );
        const runContainer = workspace
          .withEnvVariable("STAYTUNED_AFFECTED_RUNTIME_EXECUTE", "1")
          .withEnvVariable("CHANGED_FILES", options.changedFiles ?? "")
          .withNewFile("/tmp/affected-node-tests.ts", program)
          .withExec(["node", "--experimental-strip-types", "/tmp/affected-node-tests.ts"]);
        
        const affectedTestsStr = (await runContainer.stdout()).trim();
        if (affectedTestsStr.length === 0) {
          skipTests = true;
        } else {
          args = affectedTestsStr.split(/\s+/).filter((val) => val.length > 0);
        }
      }
      if (!skipTests) {
        let testWorkspace = workspace;
        let buildScript = "";
        const symlinkScript = [
          `mkdir -p node_modules/@staytunedllp`,
          `ln -sf ../.. node_modules/@staytunedllp/staystack`,
          `ln -sf ../../.staystack node_modules/@staytunedllp/staystack-config`,
        ].join("\n");

        if (options.runAffected && args.length > 0) {
          testWorkspace = testWorkspace
            .withEnvVariable("STAYTUNED_AFFECTED_TEST_FILES_JSON", JSON.stringify(args))
            .withEnvVariable("STAYTUNED_AFFECTED_BUILD_BUILDER", STAYTUNED_AFFECTED_BUILD_BUILDER);
          buildScript = [
            STRICT_SHELL_HEADER,
            `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
            symlinkScript,
            `node -e "$STAYTUNED_AFFECTED_BUILD_BUILDER"`,
          ].join("\n");
        } else {
          buildScript = [
            STRICT_SHELL_HEADER,
            `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
            symlinkScript,
            `if node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(pkg.scripts && pkg.scripts['type-check'] ? 0 : 1)" 2>/dev/null; then`,
            `  npm run type-check`,
            `elif node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(pkg.scripts && pkg.scripts.build ? 0 : 1)" 2>/dev/null; then`,
            `  npm run build`,
            `fi`,
          ].join("\n");
        }

        testWorkspace = testWorkspace.withExec(["bash", "-lc", buildScript]);

        if (args.length > 0) {
          const pkgFilePath = packagePath === "." ? "package.json" : `${packagePath}/package.json`;
          let pkgContent = "";
          try {
            pkgContent = await source.file(pkgFilePath).contents();
          } catch {}

          let script = "node --test";
          if (pkgContent) {
            try {
              const pkg = JSON.parse(pkgContent);
              script = pkg.scripts?.test || "node --test";
            } catch {}
          }

          const replacedScript = replaceTestScript(script, args);

          const runScript = [
            STRICT_SHELL_HEADER,
            `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
            replacedScript,
          ].join("\n");

          workspace = testWorkspace.withExec(["bash", "-lc", runScript]);
        } else {
          workspace = runNpmScript(testWorkspace, "test", {
            cwd: packagePath,
            args,
          });
        }
      } else {
        workspace = workspace.withExec(["echo", "No affected tests found to run."]);
      }
    }

    if (options.build) {
      workspace = runNpmScript(workspace, "build", { cwd: packagePath });
    }
  }

  return workspace.stdout();
}
