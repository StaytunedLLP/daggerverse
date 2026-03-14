import { Directory, Secret } from "@dagger.io/dagger";
import { DEFAULT_REGISTRY_SCOPE } from "../shared/constants.js";
import { resolveNodeAuthToken } from "../shared/auth.js";
import { withNpmAuth } from "../shared/npm.js";
import { firebaseNodeBase } from "./base.js";
import { FIREBASE_WORKDIR } from "./constants.js";

export type FirebaseInstallOptions = {
  nodeAuthToken?: Secret;
  registryScope?: string;
};

export async function installFirebaseDependencies(
  source: Directory,
  directories: string[],
  options: FirebaseInstallOptions = {},
): Promise<Directory> {
  let container = firebaseNodeBase();

  if (options.nodeAuthToken || process.env.NODE_AUTH_TOKEN || process.env.GITHUB_TOKEN) {
    container = withNpmAuth(container, resolveNodeAuthToken(options.nodeAuthToken), {
      workspace: FIREBASE_WORKDIR,
      npmrcPaths: directories,
      registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    });
  }

  for (const dir of directories.filter((entry) => entry.trim().length > 0)) {
    const path = dir.trim();
    const dirRef = source.directory(path);
    const entries = await dirRef.entries();

    if (!entries.includes("package.json")) {
      container = container.withDirectory(`${FIREBASE_WORKDIR}/${path}`, dirRef);
      continue;
    }

    let workspace = container
      .withWorkdir(`${FIREBASE_WORKDIR}/${path}`)
      .withFile("package.json", dirRef.file("package.json"));

    if (!entries.includes("package-lock.json")) {
      throw new Error(`Missing ${path}/package-lock.json`);
    }

    workspace = workspace.withFile(
      "package-lock.json",
      dirRef.file("package-lock.json"),
    );

    if (entries.includes(".npmrc")) {
      workspace = workspace.withFile(".npmrc", dirRef.file(".npmrc"));
    }

    container = workspace.withExec(["npm", "ci"]).withDirectory(".", dirRef);
  }

  return container.withDirectory(FIREBASE_WORKDIR, source).directory(FIREBASE_WORKDIR);
}
