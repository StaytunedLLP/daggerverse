import { Container } from "@dagger.io/dagger";
import { STRICT_SHELL_HEADER } from "./constants.js";

const FIREBASE_APT_PACKAGES = ["default-jre-headless"];
const FIREBASE_GLOBAL_NPM_PACKAGES = ["firebase-tools"];
const TERRAFORM_APT_PACKAGES = ["ca-certificates", "curl", "unzip"];

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

export function withTerraformCli(
  container: Container,
  version = "1.11.4",
): Container {
  return withAptPackages(container, TERRAFORM_APT_PACKAGES).withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      'ARCH="$(dpkg --print-architecture)"',
      'case "$ARCH" in',
      '  amd64) TF_ARCH="amd64" ;;',
      '  arm64) TF_ARCH="arm64" ;;',
      '  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;',
      "esac",
      `TF_VERSION="${version}"`,
      'curl -fsSL "https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_linux_${TF_ARCH}.zip" -o /tmp/terraform.zip',
      "unzip -oq /tmp/terraform.zip -d /usr/local/bin",
      "chmod +x /usr/local/bin/terraform",
      "terraform version",
    ].join("\n"),
  ]);
}
