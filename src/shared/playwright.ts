import { Container } from "@dagger.io/dagger";
import {
  DEFAULT_PLAYWRIGHT_BROWSERS,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "./constants.js";
import { resolveWorkspacePath, shellQuote } from "./path-utils.js";
import type { PlaywrightOptions } from "./types.js";

export function withPlaywrightSystemDeps(
  container: Container,
  options: PlaywrightOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const cwd = resolveWorkspacePath(workspace, options.cwd ?? ".");
  const browsers = options.browsers ?? DEFAULT_PLAYWRIGHT_BROWSERS;
  const browserArgs = browsers.map(shellQuote).join(" ");

  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(cwd)}`,
      browserArgs.length > 0
        ? `npx playwright install-deps ${browserArgs}`
        : "npx playwright install-deps",
    ].join("\n"),
  ]);
}

export function withPlaywrightBrowsers(
  container: Container,
  options: PlaywrightOptions = {},
): Container {
  const workspace = options.workspace ?? DEFAULT_WORKSPACE;
  const cwd = resolveWorkspacePath(workspace, options.cwd ?? ".");
  const browsers = options.browsers ?? DEFAULT_PLAYWRIGHT_BROWSERS;
  const browserArgs = browsers.map(shellQuote).join(" ");

  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      `cd ${shellQuote(cwd)}`,
      browserArgs.length > 0
        ? `npx playwright install ${browserArgs}`
        : "npx playwright install",
    ].join("\n"),
  ]);
}
