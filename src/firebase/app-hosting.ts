import { Container, Directory, Secret } from "@dagger.io/dagger";
import { firebaseAppHostingBase } from "./base.js";
import {
  FIREBASE_WIF_CREDENTIALS_PATH,
  FIREBASE_WIF_OIDC_TOKEN_PATH,
  FIREBASE_WORKDIR,
  GCP_CREDENTIALS_PATH,
} from "./constants.js";
import { shellQuote } from "../shared/path-utils.js";

function withAppHostingAuth(
  container: Container,
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Container {
  if (gcpCredentials) {
    return container
      .withMountedSecret(GCP_CREDENTIALS_PATH, gcpCredentials)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", GCP_CREDENTIALS_PATH)
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        GCP_CREDENTIALS_PATH,
      )
      .withoutEnvVariable("FIREBASE_TOKEN");
  }

  if (wifProvider && wifServiceAccount && wifOidcToken) {
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
          file: FIREBASE_WIF_OIDC_TOKEN_PATH,
        },
      },
      null,
      2,
    );

    return container
      .withMountedSecret(FIREBASE_WIF_OIDC_TOKEN_PATH, wifOidcToken)
      .withNewFile(FIREBASE_WIF_CREDENTIALS_PATH, `${credentialsPayload}\n`)
      .withEnvVariable(
        "GOOGLE_APPLICATION_CREDENTIALS",
        FIREBASE_WIF_CREDENTIALS_PATH,
      )
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        FIREBASE_WIF_CREDENTIALS_PATH,
      )
      .withoutEnvVariable("FIREBASE_TOKEN");
  }

  throw new Error(
    "Either gcpCredentials or (wifProvider, wifServiceAccount, wifOidcToken) must be provided.",
  );
}

function appHostingConfig(backendId: string, rootDir: string): string {
  return JSON.stringify(
    {
      apphosting: {
        backendId,
        rootDir,
      },
    },
    null,
    2,
  );
}

function backendExistsCommand(
  projectId: string,
  backendId: string,
  appId: string,
  region: string,
): string[] {
  const createCommand = [
    "firebase",
    "apphosting:backends:create",
    "--backend",
    shellQuote(backendId),
    "--project",
    shellQuote(projectId),
    "--primary-region",
    shellQuote(region),
    appId ? `--app ${shellQuote(appId)}` : "",
    "--non-interactive",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "bash",
    "-lc",
    [
      "set -euo pipefail",
      `if firebase apphosting:backends:get ${shellQuote(backendId)} --project ${shellQuote(projectId)} --json >/dev/null 2>&1; then`,
      `  echo "Backend ${backendId} already exists.";`,
      "else",
      `  echo "Backend ${backendId} not found, attempting to create in ${region}...";`,
      `  ${createCommand}`,
      "fi",
    ].join("\n"),
  ];
}

export async function deployFirebaseApphostingProject(
  source: Directory,
  projectId: string,
  backendId: string,
  rootDir = ".",
  appId = "",
  region = "asia-southeast1",
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Promise<string> {
  const prepared = firebaseAppHostingBase()
    .withDirectory(FIREBASE_WORKDIR, source)
    .withWorkdir(FIREBASE_WORKDIR)
    .withNewFile(
      `${FIREBASE_WORKDIR}/firebase.json`,
      `${appHostingConfig(backendId, rootDir)}\n`,
    );

  const authenticated = withAppHostingAuth(
    prepared,
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
  ).withExec(backendExistsCommand(projectId, backendId, appId, region));

  const backendJson = await authenticated
    .withExec([
      "firebase",
      "apphosting:backends:get",
      backendId,
      "--project",
      projectId,
      "--json",
    ])
    .stdout();

  const backend = JSON.parse(backendJson) as {
    result?: {
      uri?: string;
    };
    uri?: string;
  };

  return backend.result?.uri ?? backend.uri ?? "URL not found";
}

export async function deleteFirebaseApphostingBackend(
  projectId: string,
  backendId: string,
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Promise<string> {
  const container = withAppHostingAuth(
    firebaseAppHostingBase(),
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
  );

  return container
    .withExec([
      "firebase",
      "apphosting:backends:delete",
      backendId,
      "--project",
      projectId,
      "--force",
      "--non-interactive",
    ])
    .stdout();
}
