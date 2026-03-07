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

function withWorkspace(
  source: Directory,
  nodeAuthToken: Secret,
  npmrcPaths: string[],
): Container {
  return dag
    .container()
    .from("node:24-bookworm")
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
        "cat > .npmrc <<'EOF'",
        "@staytunedllp:registry=https://npm.pkg.github.com",
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
        "EOF",
        `for path in $(printf '%s' ${JSON.stringify(npmrcPaths.join(","))} | tr ',' ' '); do`,
        "  target=\"${path}\"",
        "  if [ \"${target}\" = \".\" ]; then",
        "    cp .npmrc /workspace/.npmrc",
        "  else",
        "    mkdir -p \"/workspace/${target}\"",
        "    cp .npmrc \"/workspace/${target}/.npmrc\"",
        "  fi",
        "done",
      ].join("\n"),
    ]);
}

function buildScript(
  packagePaths: string[],
  options: {
    playwrightInstall: boolean;
    firebaseTools: boolean;
    javaDependency: boolean;
  },
): string {
  const lines = ["set -euo pipefail"];

  if (options.javaDependency) {
    lines.push("apt-get update");
    lines.push("DEBIAN_FRONTEND=noninteractive apt-get install -y default-jre-headless");
  }

  if (options.firebaseTools) {
    lines.push("npm install -g firebase-tools");
  }

  for (const packagePath of packagePaths) {
    const workspacePath =
      packagePath === "." ? "/workspace" : `/workspace/${packagePath}`;

    lines.push(`cd ${shellQuote(workspacePath)}`);
    lines.push("npm ci");
  }

  if (options.playwrightInstall) {
    lines.push("cd /workspace");
    lines.push("npx playwright install --with-deps");
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
    javaDependency = false,
  ): Promise<string> {
    const packages = splitCsv(packagePaths);
    const workspace = withWorkspace(source, nodeAuthToken, packages).withExec(
      [
        "bash",
        "-lc",
        buildScript(packages, {
          playwrightInstall,
          firebaseTools,
          javaDependency,
        }),
      ],
    );

    return workspace.stdout();
  }
}
