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

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
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

function withWorkspace(
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
    .withExec([
      "bash",
      "-lc",
      [
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
      ].join("\n"),
    ]);
}

function buildScript(
  packagePaths: string[],
  options: {
    playwrightInstall: boolean;
  },
): string {
  const lines = ["set -euo pipefail"];

  for (const packagePath of packagePaths) {
    const workspacePath =
      packagePath === "." ? "/workspace" : `/workspace/${packagePath}`;

    lines.push(`cd ${shellQuote(workspacePath)}`);
    lines.push("npm ci");
  }

  if (options.playwrightInstall) {
    lines.push("cd /workspace");
    lines.push("npm i playwright install --with-deps");
  }

  return lines.join("\n");
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

    const workspace = withWorkspace(
      container,
      source,
      nodeAuthToken,
      packages,
    ).withExec([
      "bash",
      "-lc",
      buildScript(packages, {
        playwrightInstall,
      }),
    ]);

    return workspace.stdout();
  }
}
