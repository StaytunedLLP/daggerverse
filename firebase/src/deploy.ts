import { Container, Directory, File, Secret } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

/**
 * Executes the Firebase deployment command.
 * 
 * @param {Directory} source - The source directory to deploy.
 * @param {string} projectId - The Firebase project ID.
 * @param {Secret} gcpCredentials - Secret containing GCP credentials (JSON or token).
 * @param {string} [only] - Optional Firebase deploy filter (e.g. 'hosting').
 * @param {string} [firebaseDir] - Optional directory containing firebase.json.
 * @returns {Promise<Container>} The container after running the deploy command.
 */
export async function deploy(
  source: Directory,
  projectId: string,
  gcpCredentials: Secret,
  only?: string,
  firebaseDir?: string
): Promise<Container> {
  const creds = await gcpCredentials.plaintext();
  const isJson = creds.trim().startsWith("{");

  const cmd = [
    "firebase",
    "deploy",
    "--project",
    projectId,
    "--non-interactive",
    "--force"
  ];

  if (only) {
    cmd.push("--only", only);
  }

  const workdir = firebaseDir ? `/src/${firebaseDir}` : "/src";

  let container = firebaseBase().withDirectory("/src", source);

  if (isJson) {
    // Standard Workload Identity or Service Account Key JSON
    container = container
      .withMountedSecret("/auth/gcp-credentials.json", gcpCredentials)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/auth/gcp-credentials.json");
  } else {
    // Direct Access Token (GCP_ACCESS_TOKEN from auth step)
    container = container.withSecretVariable("FIREBASE_TOKEN", gcpCredentials);
  }

  return container.withWorkdir(workdir).withExec(cmd);
}
