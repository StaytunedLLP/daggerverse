import { Container, Directory, File } from "@dagger.io/dagger";
import { firebaseBase } from "./firebase.js";

export async function deploy(
  source: Directory,
  projectId: string,
  gcpCredentials: File,
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
    .withFile("/auth/gcp-credentials.json", gcpCredentials)
    .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/auth/gcp-credentials.json")
    .withWorkdir(workdir)
    .withExec(cmd);
}
