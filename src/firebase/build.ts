import { Directory, Secret } from "@dagger.io/dagger";
import { firebaseNodeBase } from "./base.js";
import { FIREBASE_WORKDIR } from "./constants.js";
import {
  type FirebaseBuildProfile,
  withFrontendEnv,
  withStaystackEnv,
} from "./env.js";

export type FirebaseBuildOptions = {
  frontendDir?: string;
  projectId?: string;
  appId?: string;
  webappConfig?: Secret;
  extraEnv?: Secret;
  buildProfile?: FirebaseBuildProfile;
  functionsRegion?: string;
  functionsBaseUrl?: string;
  accessActor?: string;
  accessVia?: string;
  buildLabel?: string;
  remoteConfigMode?: string;
};

export async function buildFirebaseProjects(
  source: Directory,
  directories: string[],
  options: FirebaseBuildOptions = {},
): Promise<Directory> {
  let container = firebaseNodeBase().withDirectory(FIREBASE_WORKDIR, source);

  if (options.frontendDir && options.projectId) {
    const sharedEnv = {
      frontendDir: options.frontendDir,
      projectId: options.projectId,
      appId: options.appId,
      webappConfig: options.webappConfig,
      extraEnv: options.extraEnv,
      envFileName: ".env.production",
      functionsRegion: options.functionsRegion,
      functionsBaseUrl: options.functionsBaseUrl,
      accessActor: options.accessActor,
      accessVia: options.accessVia,
      buildLabel: options.buildLabel,
      remoteConfigMode: options.remoteConfigMode,
    };

    container =
      options.buildProfile === "staystack"
        ? withStaystackEnv(container, sharedEnv)
        : withFrontendEnv(container, sharedEnv);
  }

  for (const dir of directories.filter((entry) => entry.trim().length > 0)) {
    container = container
      .withWorkdir(`${FIREBASE_WORKDIR}/${dir.trim()}`)
      .withExec(["npm", "run", "build"]);
  }

  return container.directory(FIREBASE_WORKDIR);
}
