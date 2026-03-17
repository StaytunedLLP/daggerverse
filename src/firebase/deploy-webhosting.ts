import { Container, Directory, Secret } from "@dagger.io/dagger";
import { firebaseCliBase } from "./base.js";
import { FIREBASE_WORKDIR, GCP_CREDENTIALS_PATH } from "./constants.js";

export async function deployFirebaseWebhostingProject(
  source: Directory,
  projectId: string,
  gcpCredentials: Secret,
  only?: string,
  firebaseDir?: string,
): Promise<Container> {
  const creds = await gcpCredentials.plaintext();
  if (!creds.trim().startsWith("{")) {
    throw new Error(
      "The gcpCredentials secret must be a GCP JSON credentials document.",
    );
  }

  const cmd = [
    "firebase",
    "deploy",
    "--project",
    projectId,
    "--non-interactive",
    "--force",
  ];

  if (only) {
    cmd.push("--only", only);
  }

  const workdir = firebaseDir
    ? `${FIREBASE_WORKDIR}/${firebaseDir}`
    : FIREBASE_WORKDIR;

  return firebaseCliBase()
    .withDirectory(FIREBASE_WORKDIR, source)
    .withMountedSecret(GCP_CREDENTIALS_PATH, gcpCredentials)
    .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", GCP_CREDENTIALS_PATH)
    .withoutEnvVariable("FIREBASE_TOKEN")
    .withWorkdir(workdir)
    .withExec(cmd);
}
