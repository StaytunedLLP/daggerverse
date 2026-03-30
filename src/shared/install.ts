import { Container } from "@dagger.io/dagger";
import { STRICT_SHELL_HEADER } from "./constants.js";

const FIREBASE_APT_PACKAGES = ["default-jre-headless"];
const FIREBASE_GLOBAL_NPM_PACKAGES = ["firebase-tools"];

export function withAptPackages(
  container: Container,
  packages: string[],
): Container {
  if (packages.length === 0) {
    return container;
  }

  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      "apt-get update",
      `DEBIAN_FRONTEND=noninteractive apt-get install -y ${packages.join(" ")}`,
    ].join("\n"),
  ]);
}

export function withGlobalNpmPackages(
  container: Container,
  packages: string[],
): Container {
  if (packages.length === 0) {
    return container;
  }

  return container.withExec(["npm", "install", "-g", ...packages]);
}

export function withFirebaseSystemPackages(container: Container): Container {
  return withAptPackages(container, FIREBASE_APT_PACKAGES);
}

export function withFirebaseCli(container: Container): Container {
  return withGlobalNpmPackages(container, FIREBASE_GLOBAL_NPM_PACKAGES);
}

export function withGhCli(container: Container): Container {
  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      "apt-get update",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y curl gpg",
      "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg",
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
      "apt-get update",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y gh",
    ].join("\n"),
  ]);
}

export function withGCloudCli(container: Container): Container {
  return container.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      "apt-get update",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y curl apt-transport-https ca-certificates gnupg",
      "mkdir -p /usr/share/keyrings",
      "curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg",
      'echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list',
      "apt-get update",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y google-cloud-cli",
    ].join("\n"),
  ]);
}
