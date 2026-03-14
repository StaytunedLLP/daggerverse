import { Directory, Secret } from "@dagger.io/dagger";
import { firebaseNodeBase } from "./base.js";
import { FIREBASE_WORKDIR } from "./constants.js";
import { withFrontendEnv } from "./env.js";

export type FirebaseBuildOptions = {
  frontendDir?: string;
  projectId?: string;
  appId?: string;
  webappConfig?: Secret;
  extraEnv?: Secret;
};

export async function buildFirebaseProjects(
  source: Directory,
  directories: string[],
  options: FirebaseBuildOptions = {},
): Promise<Directory> {
  let container = firebaseNodeBase().withDirectory(FIREBASE_WORKDIR, source);

  if (options.frontendDir && options.projectId) {
    container = withFrontendEnv(container, {
      frontendDir: options.frontendDir,
      projectId: options.projectId,
      appId: options.appId,
      webappConfig: options.webappConfig,
      extraEnv: options.extraEnv,
    });
  }

  for (const dir of directories.filter((entry) => entry.trim().length > 0)) {
    container = container
      .withWorkdir(`${FIREBASE_WORKDIR}/${dir.trim()}`)
      .withExec(["npm", "run", "build"]);
  }

  return container.directory(FIREBASE_WORKDIR);
}
