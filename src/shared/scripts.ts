import { Container } from "@dagger.io/dagger";
import { DEFAULT_WORKSPACE, STRICT_SHELL_HEADER } from "./constants.js";
import { resolveWorkspacePath, shellQuote } from "./path-utils.js";
import type { RunScriptOptions } from "./types.js";

export function runNpmScript(
  container: Container,
  script: string,
  options: RunScriptOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const cwd = resolveWorkspacePath(workspace, options.cwd ?? ".");
  const args = options.args ?? [];
  const scriptArgs =
    args.length > 0 ? ` -- ${args.map(shellQuote).join(" ")}` : "";

  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(cwd)}`,
      `npm run ${shellQuote(script)}${scriptArgs}`,
    ].join("\n"),
  ]);
}
