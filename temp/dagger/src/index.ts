import { argument, check, dag, func, object } from "@dagger.io/dagger";
import type { Container, Directory, Secret } from "@dagger.io/dagger";
import {
  buildInternalSelectorProgram,
  internalAffectedSelectorCommand,
  listTestsSelectorMode,
} from "./affected-tests.js";

const sourceExcludes = [
  ".git",
  "dagger",
  "dist",
  "node_modules",
  "playwright-report",
  "reports",
  "test-results",
];

const workspacePath = "/workspace";
const nodeImage = "node:22-bookworm";
const npmCacheVolume = "staylook-npm-cache-node24";
const playwrightCacheVolume = "staylook-playwright-cache-node24";
const aptArchiveCacheVolume = "staylook-apt-archive-node24";
const aptListsCacheVolume = "staylook-apt-lists-node24";

const defaultAffectedSelectorCommand = internalAffectedSelectorCommand;
const defaultAffectedSelectorMode = listTestsSelectorMode;
const defaultAffectedTestCommand = "npm run test:e2e";

function projectSource(): Directory {
  return dag.currentWorkspace().directory(".", {
    exclude: sourceExcludes,
    gitignore: true,
  });
}

function staydevops() {
  return dag.staydevopsTs();
}

function resolveNodeAuthToken(): Secret {
  const token = process.env.NODE_AUTH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (!token || token.trim().length === 0) {
    throw new Error(
      "NODE_AUTH_TOKEN or GITHUB_TOKEN must be set to prepare the Playwright workspace.",
    );
  }

  return dag.setSecret("staylook-node-auth-token", token);
}

function shouldSkipReferenceChecksFromEnv(): boolean {
  const raw = process.env.SKIP_REFERENCE_CHECKS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function runShell(container: Container, script: string): Container {
  return container.withExec(["bash", "-lc", `set -euo pipefail\n${script}`]);
}


function parseSelectorOutput(rawOutput: string): string[] {
  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(/\s+/).filter((value) => value.length > 0);
}

function installedWorkspace(
  source: Directory,
  nodeAuthToken?: Secret,
): Container {
  const lockfiles = dag.directory().withDirectory(".", source, {
    include: ["**/package.json", "package-lock.json"],
    exclude: ["node_modules", "**/node_modules"],
  });

  let container = dag
    .container()
    .from(nodeImage)
    .withWorkdir(workspacePath)
    .withEnvVariable("HUSKY", "0")
    .withSecretVariable(
      "NODE_AUTH_TOKEN",
      nodeAuthToken ?? resolveNodeAuthToken(),
    )
    .withMountedCache("/root/.npm", dag.cacheVolume(npmCacheVolume))
    .withMountedCache(
      "/root/.cache/ms-playwright",
      dag.cacheVolume(playwrightCacheVolume),
    )
    .withMountedCache("/var/cache/apt", dag.cacheVolume(aptArchiveCacheVolume))
    .withMountedCache("/var/lib/apt/lists", dag.cacheVolume(aptListsCacheVolume))
    .withDirectory(workspacePath, lockfiles);

  container = runShell(container, "npm ci");
  return container;
}

function workspaceWithSource(source: Directory, nodeAuthToken?: Secret): Container {
  return installedWorkspace(source, nodeAuthToken).withDirectory(workspacePath, source);
}


function playwrightWorkspace(
  source: Directory,
  skipReferenceChecks = false,
  nodeAuthToken?: Secret,
): Container {
  let container = installedWorkspace(source, nodeAuthToken);
  
  container = runShell(
    container,
    [
      `cd ${workspacePath}`,
      "npx playwright install-deps chromium",
      "if ls /root/.cache/ms-playwright/chromium-* >/dev/null 2>&1; then",
      "  echo 'Chromium already present in cache; skipping download.'",
      "else",
      "  npx playwright install chromium",
      "fi",
    ].join("\n"),
  );

  container = container.withDirectory(workspacePath, source);

  const shouldSkip = skipReferenceChecks || shouldSkipReferenceChecksFromEnv();
  const buildCommand = shouldSkip ? "npm run build:copilot" : "npm run build";
  container = runShell(container, `cd ${workspacePath}\n${buildCommand}`);

  return container;
}

function selectorWorkspace(source: Directory, nodeAuthToken?: Secret): Container {
  return workspaceWithSource(source, nodeAuthToken);
}

function buildPlaywrightArgs(selector: string, grep: string): string[] {
  const args: string[] = [];

  if (selector.trim().length > 0) {
    // Split by whitespace to support multiple test paths passed as a single string
    const parts = selector.trim().split(/\s+/);
    args.push(...parts);
  }

  if (grep.trim().length > 0) {
    args.push("--grep", grep.trim());
  }

  return args;
}

async function resolveAffectedSelectors(
  container: Container,
  base: string,
  selectorCommand: string,
  selectorMode: string,
  changedFiles: string = "",
): Promise<string> {
  if (selectorCommand === internalAffectedSelectorCommand) {
    const program = buildInternalSelectorProgram(base, selectorMode);
    const scriptPath = "/tmp/affected-selector.mjs";
    const runContainer = container
      .withEnvVariable("STAYLOOK_AFFECTED_RUNTIME_EXECUTE", "1")
      .withEnvVariable("CHANGED_FILES", changedFiles)
      .withNewFile(scriptPath, program)
      .withExec(["node", scriptPath]);

    return runContainer.stdout();
  }

  const selectorShell = [
    `cd ${workspacePath}`,
    `${selectorCommand} ${selectorMode} --base=${JSON.stringify(base)}`,
  ].join("\n");

  return runShell(container, `${selectorShell} 2>&1`).stdout();
}

@object()
export class StaylookCi {
  @check()
  async format(): Promise<void> {
    await runShell(
      workspaceWithSource(projectSource()),
      `cd ${workspacePath}\nnpm run format:check`,
    ).stdout();
  }

  @check()
  async lint(): Promise<void> {
    await runShell(
      workspaceWithSource(projectSource()),
      `cd ${workspacePath}\nnpm run lint`,
    ).stdout();
  }

  @check()
  async build(skipReferenceChecks: boolean = false): Promise<void> {
    const shouldSkip =
      skipReferenceChecks || shouldSkipReferenceChecksFromEnv();

    const buildCommand = shouldSkip ? "npm run build:copilot" : "npm run build";

    await runShell(
      workspaceWithSource(projectSource()),
      `cd ${workspacePath}\n${buildCommand}`,
    ).stdout();
  }

  @check()
  async smokeE2E(): Promise<void> {
    await runShell(
      playwrightWorkspace(projectSource()),
      `cd ${workspacePath}\nnpm run test:e2e:smoke`,
    ).stdout();
  }

  @func()
  async warmWorkspace(
    @argument({
      defaultPath: ".",
      ignore: [
        ".git",
        "dagger",
        "dist",
        "node_modules",
        "playwright-report",
        "reports",
        "test-results",
      ],
    })
    source: Directory,
    nodeAuthToken?: Secret,
  ): Promise<string> {
    return staydevops().prepareNodeWorkspace(source, {
      nodeAuthToken: nodeAuthToken ?? resolveNodeAuthToken(),
      firebaseTools: false,
      packagePaths: ".",
      playwrightInstall: true,
    });
  }


  @func()
  async testPlaywright(
    @argument({
      defaultPath: "..",
      ignore: [
        "dagger",
        "dist",
        "node_modules",
        "playwright-report",
        "reports",
        "test-results",
      ],
    })
    source: Directory,
    selector = "",
    all = false,
    base = "origin/main",
    grep = "",
    listOnly = false,
    changedFiles = "",
    skipReferenceChecks = true,
    nodeAuthToken?: Secret,
  ): Promise<string> {
    const isListing = listOnly;
    let container =
      isListing ?
        selectorWorkspace(source, nodeAuthToken)
      : playwrightWorkspace(source, skipReferenceChecks, nodeAuthToken);

    if (changedFiles.trim().length > 0) {
      container = container.withEnvVariable("CHANGED_FILES", changedFiles);
    }

    let finalSelectors: string[] = [];

    if (all) {
      if (isListing) {
        const allSelectorsRaw = await resolveAffectedSelectors(
          container,
          base,
          defaultAffectedSelectorCommand,
          "--list-tests-all",
          changedFiles,
        );
        return allSelectorsRaw.trim();
      }
      finalSelectors = [];
    } else if (selector.trim().length > 0) {
      finalSelectors = parseSelectorOutput(selector);
    } else {
      const selectorsRaw = await resolveAffectedSelectors(
        container,
        base,
        defaultAffectedSelectorCommand,
        defaultAffectedSelectorMode,
        changedFiles,
      );
      finalSelectors = parseSelectorOutput(selectorsRaw);

      if (finalSelectors.length === 0) {
        return "No affected tests detected.";
      }
    }

    if (isListing) {
      return finalSelectors.join(" ");
    }

    const args = buildPlaywrightArgs(finalSelectors.join(" "), grep)
      .map((value) => JSON.stringify(value))
      .join(" ");

    return runShell(
      container,
      `cd ${workspacePath}\nnpm run test:e2e${args.length > 0 ? ` -- ${args}` : ""}`,
    ).stdout();
  }
}
