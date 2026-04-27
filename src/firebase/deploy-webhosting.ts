import { Container, Directory, Secret, dag } from "@dagger.io/dagger";
import { firebaseCliBase } from "./base.js";
import { FIREBASE_WORKDIR, GCP_CREDENTIALS_PATH } from "./constants.js";

export async function deployFirebaseWebhostingProject(
  source: Directory,
  projectId: string,
  gcpCredentials?: Secret,
  only?: string,
  firebaseDir?: string,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Promise<Container> {
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

  let container = firebaseCliBase()
    .withDirectory(FIREBASE_WORKDIR, source)
    .withWorkdir(workdir);

  if (gcpCredentials) {
    container = container
      .withMountedSecret(GCP_CREDENTIALS_PATH, gcpCredentials)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", GCP_CREDENTIALS_PATH)
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        GCP_CREDENTIALS_PATH,
      )
      .withoutEnvVariable("FIREBASE_TOKEN");
  } else if (wifProvider && wifServiceAccount && wifOidcToken) {
    const resolvedAudience =
      wifAudience.trim() || `https://iam.googleapis.com/${wifProvider.trim()}`;
    const credentialsPayload = JSON.stringify(
      {
        type: "external_account",
        audience: resolvedAudience,
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        token_url: "https://sts.googleapis.com/v1/token",
        service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${wifServiceAccount}:generateAccessToken`,
        credential_source: {
          file: "/tmp/oidc-token.txt",
        },
      },
      null,
      2,
    );

    // Exchange OIDC token for a real access token using gcloud
    const tokenContainer = dag
      .container()
      .from("gcr.io/google.com/cloudsdktool/google-cloud-cli:slim")
      .withMountedSecret("/tmp/oidc-token.txt", wifOidcToken)
      .withNewFile("/tmp/wif-credentials.json", `${credentialsPayload}\n`)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/wif-credentials.json")
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        "/tmp/wif-credentials.json",
      );

    const accessToken = await tokenContainer
      .withExec([
        "gcloud",
        "auth",
        "login",
        "--cred-file=/tmp/wif-credentials.json",
      ])
      .withExec(["gcloud", "auth", "print-access-token"])
      .stdout();

    container = container
      .withMountedSecret("/tmp/oidc-token.txt", wifOidcToken)
      .withNewFile("/tmp/wif-credentials.json", `${credentialsPayload}\n`)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/wif-credentials.json")
      .withSecretVariable("GOOGLE_OAUTH_ACCESS_TOKEN", dag.setSecret("fb-hosting-access-token", accessToken))
      .withoutEnvVariable("FIREBASE_TOKEN");
  } else {
    throw new Error(
      "Either gcpCredentials or (wifProvider, wifServiceAccount, wifOidcToken) must be provided.",
    );
  }

  return container.withExec(cmd);
}
