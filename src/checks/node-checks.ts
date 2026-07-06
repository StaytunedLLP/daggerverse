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
        const buildCheck = `node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(pkg.scripts && pkg.scripts.build ? 0 : 1)"`;

        testWorkspace = testWorkspace.withExec(["bash", "-lc", [
          STRICT_SHELL_HEADER,
          `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
          `if ${buildCheck} 2>/dev/null; then`,
          `  npm run build`,
          `fi`,
        ].join("\n")]);

        if (args.length > 0) {
          const runScript = [
            STRICT_SHELL_HEADER,
            `cd ${shellQuote(resolveWorkspacePath(DEFAULT_WORKSPACE, packagePath))}`,
            `TEST_SCRIPT=$(node -e "
              const fs = require('fs');
              const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
              let script = pkg.scripts.test || 'node --test';
              const affectedFiles = process.env.STAYTUNED_AFFECTED_TEST_FILES;

              const targetRegex = /([a-zA-Z0-9_.-]+(?:\\\\/[a-zA-Z0-9_.-]+)*)\\\\/\\\\*\\\\*\\\\/[a-zA-Z0-9_*.-]+\\\\.([a-zA-Z0-9]+)/g;
              let match;
              const targets = [];
              while ((match = targetRegex.exec(script)) !== null) {
                targets.push({
                  raw: match[0],
                  dir: match[1],
                  ext: match[2]
                });
              }

              if (targets.length > 0) {
                const target = targets.find(t => t.dir !== 'src') || targets[0];
                const mappedFiles = affectedFiles.split(' ').map(f => {
                  const clean = f.replace(/^'|'$/g, '');
                  if (clean.startsWith('src/') && target.dir !== 'src') {
                    const relativePart = clean.slice(4);
                    const mappedPath = target.dir + '/' + relativePart.replace(/\\\\.ts$/, '.' + target.ext).replace(/\\\\.js$/, '.' + target.ext);
                    return \\"\\'\\" + mappedPath + \\"\\'\\";
                  }
                  return f;
                }).join(' ');

                let replaced = false;
                for (const t of targets) {
                  const targetStr = t.raw;
                  const index = script.indexOf(targetStr);
                  if (index !== -1) {
                    const prevChar = script[index - 1];
                    const nextChar = script[index + targetStr.length];
                    const isQuote = prevChar === nextChar && ["'", '\\"', String.fromCharCode(96)].includes(prevChar);

                    if (isQuote) {
                      const quoted = prevChar + targetStr + nextChar;
                      script = script.replace(quoted, () => {
                        if (!replaced) {
                          replaced = true;
                          return mappedFiles;
                        }
                        return '';
                      });
                    } else {
                      script = script.replace(targetStr, () => {
                        if (!replaced) {
                          replaced = true;
                          return mappedFiles;
                        }
                        return '';
                      });
                    }
                  }
                }
              } else {
                script = script.replace(/[\\x22\\x27\\x60]?src\\\\/\\\\*\\\\*\\\\/[^\\x22\\x27\\x60\\s]+[\\x22\\x27\\x60]?/g, affectedFiles);
              }
              console.log(script);
            ")`,
            `eval "$TEST_SCRIPT"`,
          ].join("\n");

          workspace = testWorkspace
            .withEnvVariable("STAYTUNED_AFFECTED_TEST_FILES", args.map(a => `'${a}'`).join(" "))
            .withExec(["bash", "-lc", runScript]);
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
