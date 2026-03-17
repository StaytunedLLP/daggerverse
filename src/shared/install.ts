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
