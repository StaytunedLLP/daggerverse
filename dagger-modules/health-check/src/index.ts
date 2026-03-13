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
        "cat > /tmp/staytuned.npmrc <<'EOF'",
        "@staytunedllp:registry=https://npm.pkg.github.com",
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
        "EOF",
        `for path in $(printf '%s' ${JSON.stringify(npmrcPaths.join(","))} | tr ',' ' '); do`,
        "  target=\"${path}\"",
        "  if [ \"${target}\" = \".\" ]; then",
        "    cp /tmp/staytuned.npmrc /workspace/.npmrc",
        "  else",
        "    mkdir -p \"/workspace/${target}\"",
        "    cp /tmp/staytuned.npmrc \"/workspace/${target}/.npmrc\"",
        "  fi",
        "done",
      ].join("\n"),
    ]);
}

function buildScript(
  packagePaths: string[],
  options: {
    build: boolean;
    test: boolean;
    lint: boolean;
    format: boolean;
    verifyChromiumBidi: boolean;
  },
): string {
  const lines = ["set -euo pipefail"];

  for (const [index, packagePath] of packagePaths.entries()) {
    const workspacePath =
      packagePath === "." ? "/workspace" : `/workspace/${packagePath}`;

    lines.push(`cd ${shellQuote(workspacePath)}`);

    lines.push("npm ci");

    if (index === 0 && options.verifyChromiumBidi) {
      lines.push("npm ls chromium-bidi --depth=0");
    }

    if (options.format) {
      lines.push("npm run format:check");
    }

    if (options.lint) {
      lines.push("npm run lint");
    }

    if (options.test) {
      lines.push("npm test");
    }

    if (options.build) {
      lines.push("npm run build");
    }
  }

  return lines.join("\n");
}

@object()
export class HealthCheck {
  @func()
  async nodeChecks(
    source: Directory,
    nodeAuthToken: Secret,
    packagePaths = ".",
    build = false,
    test = false,
    lint = false,
    format = false,
    verifyChromiumBidi = false,
  ): Promise<string> {
    const packages = splitCsv(packagePaths);
    const workspace = withWorkspace(source, nodeAuthToken, packages).withExec(
      [
        "bash",
        "-lc",
        buildScript(packages, {
          build,
          test,
          lint,
          format,
          verifyChromiumBidi,
        }),
      ],
    );

    return workspace.stdout();
  }
}
