import { Container, Directory, Secret } from "@dagger.io/dagger";
import { buildFirebaseProjects } from "./build.js";
import { installFirebaseDependencies } from "./dependencies.js";
import { deployFirebaseWebhostingProject } from "./deploy-webhosting.js";

export type FirebaseDeployWebhostingOptions = {
  appId?: string;
  frontendDir?: string;
  backendDir?: string;
  firebaseDir?: string;
  only?: string;
  webappConfig?: Secret;
  extraEnv?: Secret;
  nodeAuthToken?: Secret;
  registryScope?: string;
};

export async function firebaseDeployWebhostingPipeline(
  source: Directory,
  projectId: string,
  gcpCredentials: Secret,
  options: FirebaseDeployWebhostingOptions = {},
): Promise<Container> {
  const installDirs = [options.frontendDir, options.backendDir].filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );

  const installed = installFirebaseDependencies(source, installDirs, {
    nodeAuthToken: options.nodeAuthToken,
    registryScope: options.registryScope,
  });
  const built = buildFirebaseProjects(installed, installDirs, {
    frontendDir: options.frontendDir,
    projectId,
    appId: options.appId,
    webappConfig: options.webappConfig,
    extraEnv: options.extraEnv,
  });
  return await deployFirebaseWebhostingProject(
    built,
    projectId,
    gcpCredentials,
    options.only,
    options.firebaseDir,
  );
}
