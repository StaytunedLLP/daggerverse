import {
  dag,
  Directory,
  object,
  func,
  Secret,
  Container,
} from "@dagger.io/dagger";

const npmCache = dag.cacheVolume("npm-cache-node24");
const playwrightCache = dag.cacheVolume("playwright-cache-node24");
const playwrightCachePath = "/playwright-cache";
const playwrightWorkspacePath = "/workspace/.playwright-browsers";

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function workspacePath(packagePath: string): string {
  return packagePath === "." ? "/workspace" : `/workspace/${packagePath}`;
}

function relativeWorkspacePath(packagePath: string): string {
  return packagePath === "." ? "." : packagePath;
}

function uniqueEntries(values: string[]): string[] {
  return [...new Set(values)];
}

function writeNpmrcScript(npmrcPaths: string[]): string {
  return [
    "set -euo pipefail",
    "cat > /tmp/staytuned.npmrc <<'EOF'",
    "@staytunedllp:registry=https://npm.pkg.github.com",
    "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
    "EOF",
    `for path in $(printf '%s' ${JSON.stringify(npmrcPaths.join(","))} | tr ',' ' '); do`,
    '  target="${path}"',
    '  if [ "${target}" = "." ]; then',
    "    cp /tmp/staytuned.npmrc /workspace/.npmrc",
    "  else",
    '    mkdir -p "/workspace/${target}"',
    '    cp /tmp/staytuned.npmrc "/workspace/${target}/.npmrc"',
    "  fi",
    "done",
  ].join("\n");
}

function withTooling(
  container: Container,
  options: {
    firebaseTools: boolean;
  },
): Container {
  let next = container;

  if (options.firebaseTools) {
    next = next.withExec([
      "bash",
      "-lc",
      [
        "set -euo pipefail",
        "apt-get update",
        "DEBIAN_FRONTEND=noninteractive apt-get install -y default-jre-headless",
      ].join("\n"),
    ]);
    next = next.withExec(["npm", "install", "-g", "firebase-tools"]);
  }

  return next;
}

function withMountedWorkspace(
  container: Container,
  source: Directory,
  nodeAuthToken: Secret,
  npmrcPaths: string[],
): Container {
  return container
    .withMountedDirectory("/workspace", source)
    .withWorkdir("/workspace")
    .withSecretVariable("NODE_AUTH_TOKEN", nodeAuthToken)
    .withMountedCache("/root/.npm", npmCache)
    .withMountedCache("/root/.cache/ms-playwright", playwrightCache)
    .withExec(["bash", "-lc", writeNpmrcScript(npmrcPaths)]);
}

function withCopiedWorkspace(
  container: Container,
  source: Directory,
  nodeAuthToken: Secret,
  npmrcPaths: string[],
): Container {
  return container
    .withDirectory("/workspace", source)
    .withWorkdir("/workspace")
    .withSecretVariable("NODE_AUTH_TOKEN", nodeAuthToken)
    .withMountedCache("/root/.npm", npmCache)
    .withMountedCache(playwrightCachePath, playwrightCache)
    .withExec(["bash", "-lc", writeNpmrcScript(npmrcPaths)]);
}

function buildScript(
  packagePaths: string[],
  options: {
    buildPaths: string[];
    playwrightInstall: boolean;
    persistPlaywrightBrowsers: boolean;
  },
): string {
  const lines = ["set -euo pipefail"];

  for (const packagePath of packagePaths) {
    lines.push(`cd ${shellQuote(workspacePath(packagePath))}`);
    lines.push("npm ci");
  }

  for (const buildPath of options.buildPaths) {
    lines.push(`cd ${shellQuote(workspacePath(buildPath))}`);
    lines.push("npm run build");
  }

  if (options.playwrightInstall) {
    lines.push("cd /workspace");

    if (options.persistPlaywrightBrowsers) {
      lines.push(
        `export PLAYWRIGHT_BROWSERS_PATH=${shellQuote(playwrightCachePath)}`,
      );
    }

    lines.push("npx playwright install --with-deps");

    if (options.persistPlaywrightBrowsers) {
      lines.push(`rm -rf ${shellQuote(playwrightWorkspacePath)}`);
      lines.push(`mkdir -p ${shellQuote(playwrightWorkspacePath)}`);
      lines.push(
        `cp -R ${shellQuote(`${playwrightCachePath}/.`)} ${shellQuote(`${playwrightWorkspacePath}/`)}`,
      );
    }
  }

  return lines.join("\n");
}

function bundleEntries(
  packagePaths: string[],
  options: {
    playwrightInstall: boolean;
  },
): string[] {
  const entries = packagePaths.flatMap((packagePath) => {
    const relativePath = relativeWorkspacePath(packagePath);
    return relativePath === "." ?
        [".npmrc", "node_modules"]
      : [`${relativePath}/.npmrc`, `${relativePath}/node_modules`];
  });

  if (options.playwrightInstall) {
    entries.push(".playwright-browsers");
  }

  return uniqueEntries(entries);
}

function bundleScript(entries: string[]): string {
  return [
    "set -euo pipefail",
    "mkdir -p /bundle",
    "entries=()",
    ...entries.map((entry) => `entries+=(${shellQuote(entry)})`),
    "existing=()",
    'for entry in "${entries[@]}"; do',
    '  if [ -e "/workspace/${entry}" ]; then',
    '    existing+=("${entry}")',
    "  fi",
    "done",
    'if [ "${#existing[@]}" -eq 0 ]; then',
    '  echo "No bundle entries found to export" >&2',
    "  exit 1",
    "fi",
    'tar -czf /bundle/copilot-workspace.tar.gz -C /workspace "${existing[@]}"',
  ].join("\n");
}

@object()
export class CopilotSetup {
  @func()
  async prepareNodeWorkspace(
    source: Directory,
    nodeAuthToken: Secret,
    packagePaths = ".",
    playwrightInstall = false,
    firebaseTools = false,
  ): Promise<string> {
    const packages = splitCsv(packagePaths);
    let container = dag.container().from("node:24-bookworm");

    if (firebaseTools) {
      container = withTooling(container, {
        firebaseTools,
      });
    }

    const workspace = withMountedWorkspace(
      container,
      source,
      nodeAuthToken,
      packages,
    ).withExec([
      "bash",
      "-lc",
      buildScript(packages, {
        buildPaths: [],
        playwrightInstall,
        persistPlaywrightBrowsers: false,
      }),
    ]);

    return workspace.stdout();
  }

  @func()
  async prepareNodeWorkspaceDirectory(
    source: Directory,
    nodeAuthToken: Secret,
    packagePaths = ".",
    buildPaths = "",
    playwrightInstall = false,
    firebaseTools = false,
  ): Promise<Directory> {
    const packages = splitCsv(packagePaths);
    const builds = splitCsv(buildPaths);
    let container = dag.container().from("node:24-bookworm");

    if (firebaseTools) {
      container = withTooling(container, {
        firebaseTools,
      });
    }

    const workspace = withCopiedWorkspace(
      container,
      source,
      nodeAuthToken,
      packages,
    ).withExec([
      "bash",
      "-lc",
      buildScript(packages, {
        buildPaths: builds,
        playwrightInstall,
        persistPlaywrightBrowsers: true,
      }),
    ]);

    return workspace.directory("/workspace");
  }

  @func()
  async prepareNodeWorkspaceBundle(
    source: Directory,
    nodeAuthToken: Secret,
    packagePaths = ".",
    playwrightInstall = false,
    firebaseTools = false,
  ): Promise<Directory> {
    const packages = splitCsv(packagePaths);
    let container = dag.container().from("node:24-bookworm");

    if (firebaseTools) {
      container = withTooling(container, {
        firebaseTools,
      });
    }

    const workspace = withCopiedWorkspace(
      container,
      source,
      nodeAuthToken,
      packages,
    ).withExec([
      "bash",
      "-lc",
      buildScript(packages, {
        buildPaths: [],
        playwrightInstall,
        persistPlaywrightBrowsers: true,
      }),
    ]);

    const bundle = workspace.withExec([
      "bash",
      "-lc",
      bundleScript(
        bundleEntries(packages, {
          playwrightInstall,
        }),
      ),
    ]);

    return bundle.directory("/bundle");
  }
}
