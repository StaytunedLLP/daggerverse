import { Container, Directory, Secret } from "@dagger.io/dagger";
import { DEFAULT_REGISTRY_SCOPE } from "../shared/constants.js";
import { maybeResolveNodeAuthToken } from "../shared/auth.js";
import { withNpmAuth, withFullSource } from "../shared/npm.js";
import { firebaseNodeBase } from "./base.js";
import { FIREBASE_WORKDIR } from "./constants.js";

export type FirebaseInstallOptions = {
  nodeAuthToken?: Secret;
  registryScope?: string;
};

export function installFirebaseDependencies(
  source: Directory,
  directories: string[],
  options: FirebaseInstallOptions = {},
): Container {
  let container = firebaseNodeBase();
  const resolvedNodeAuthToken = maybeResolveNodeAuthToken(options.nodeAuthToken);

  if (resolvedNodeAuthToken) {
    container = withNpmAuth(container, resolvedNodeAuthToken, {
      workspace: FIREBASE_WORKDIR,
      npmrcPaths: directories,
      registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    });
  }

  const dirs = directories
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  for (const path of dirs) {
    const dirRef = source.directory(path);

    // Layered dependency installation with lazy evaluation and robustness.
    // We use withDirectory with include filters to lazily copy only manifest files if they exist.
    // This avoids early-awaiting on host directory entries and prevents crashes if files are missing.
    container = container
      .withWorkdir(`${FIREBASE_WORKDIR}/${path}`)
      .withDirectory(".", dirRef, {
        include: ["package.json", "package-lock.json", ".npmrc"],
      })
      .withExec([
        "bash",
        "-c",
        "if [ -f package.json ]; then npm ci; fi",
      ]);
  }

  return withFullSource(container, source, {
    workspace: FIREBASE_WORKDIR,
    strategy: "overlay",
  });
}
