import { Directory, Secret } from "@dagger.io/dagger";
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
  targetEnv?: string;
  firebaseEnv?: string;
  firestoreDatabaseId?: string;
  functionsRegion?: string;
  wifProvider?: string;
  wifServiceAccount?: string;
  wifOidcToken?: Secret;
  wifAudience?: string;
};

export async function firebaseDeployWebhostingPipeline(
  source: Directory,
  projectId: string,
  gcpCredentials?: Secret,
  options: FirebaseDeployWebhostingOptions = {},
): Promise<string> {
  const installDirs = [options.frontendDir, options.backendDir].filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );

  const installed = await installFirebaseDependencies(source, installDirs, {
    nodeAuthToken: options.nodeAuthToken,
    registryScope: options.registryScope,
  });
  const built = await buildFirebaseProjects(installed, installDirs, {
    frontendDir: options.frontendDir,
    projectId,
    appId: options.appId,
    webappConfig: options.webappConfig,
    extraEnv: options.extraEnv,
    targetEnv: options.targetEnv,
    firebaseEnv: options.firebaseEnv,
    firestoreDatabaseId: options.firestoreDatabaseId,
    functionsRegion: options.functionsRegion,
  });
  const deployed = await deployFirebaseWebhostingProject(
    built,
    projectId,
    gcpCredentials,
    options.only,
    options.firebaseDir,
    options.wifProvider,
    options.wifServiceAccount,
    options.wifOidcToken,
    options.wifAudience,
  );

  return deployed.stdout();
}

