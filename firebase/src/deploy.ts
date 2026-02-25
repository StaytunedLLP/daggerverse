import { Container, Directory, File, Secret } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

/**
 * Executes the Firebase deployment command inside a container.
 * 
 * @param {Directory} source - The source directory to deploy.
 * @param {string} projectId - The Firebase project ID.
 * @param {Secret} gcpCredentials - The service account key secret for authentication.
 * @param {string} [only] - Optional filter for what to deploy (e.g. 'hosting').
 * @param {string} [firebaseDir] - Optional directory containing firebase.json.
 * @returns {Promise<Container>} The container after executing the deploy command.
 */
export async function deploy(
  source: Directory,
  projectId: string,
  gcpCredentials: Secret,
  only?: string,
  firebaseDir?: string
): Promise<Container> {
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

  // Workload Identity Federation automatically generates application credentials.
  // We grab that json file and mount it securely into the firebase CLI container path.
  return firebaseBase()
    .withDirectory("/src", source)
    .withSecretFile("/auth/gcp-credentials.json", gcpCredentials)
    .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/auth/gcp-credentials.json")
    .withWorkdir(workdir)
    .withExec(cmd);
}
