import { Container, Directory, File, Secret } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

const GCP_CREDENTIALS_PATH = "/auth/gcp-credentials.json";

/**
 * Executes the Firebase deployment command.
 * 
 * @param {Directory} source - The source directory to deploy.
 * @param {string} projectId - The Firebase project ID.
 * @param {Secret} gcpCredentials - Secret containing GCP credentials (JSON).
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

  if (!isJson) {
    throw new Error(
      "The 'gcpCredentials' secret must be a valid GCP JSON credentials file (Service Account Key or Workload Identity Federated JSON). " +
      "Authenticating with raw access tokens via 'FIREBASE_TOKEN' is deprecated. " +
      "Please update your CI/CD to use Workload Identity Federation (WIF) 'Approach 2' by setting 'create_credentials_file: true' in 'google-github-actions/auth'."
    );
  }

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

  const container = firebaseBase()
    .withDirectory("/src", source)
    // Mount the JSON credentials and set standard environment variable
    .withMountedSecret(GCP_CREDENTIALS_PATH, gcpCredentials)
    .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", GCP_CREDENTIALS_PATH)
    // Explicitly unset FIREBASE_TOKEN to prevent firebase-tools from seeing it and showing deprecation warnings
    .withoutEnvVariable("FIREBASE_TOKEN")
    .withWorkdir(workdir)
    .withExec(cmd);

  return container;
}
