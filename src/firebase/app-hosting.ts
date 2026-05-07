import { Container, Directory, Secret } from "@dagger.io/dagger";
import { firebaseAppHostingBase } from "./base.js";
import { buildFirebaseProjects } from "./build.js";
import {
  FIREBASE_WIF_CREDENTIALS_PATH,
  FIREBASE_WIF_OIDC_TOKEN_PATH,
  FIREBASE_WORKDIR,
  GCP_CREDENTIALS_PATH,
} from "./constants.js";
import { installFirebaseDependencies } from "./dependencies.js";

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
  rootDir: string,
): string[] {
  const appFlag = appId ? ` --app ${appId}` : "";

  return [
    "bash",
    "-c",
    `
set -euo pipefail

BACKEND_JSON=$(firebase apphosting:backends:get ${backendId} \
  --project ${projectId} \
  --json 2>/dev/null || true)

if echo "$BACKEND_JSON" | grep -q '"uri"'; then

  echo "Backend ${backendId} already exists and is healthy."

else

  echo "Backend ${backendId} missing or invalid. Creating..."

  ATTEMPT=1
  MAX_ATTEMPTS=5

  until printf '%s\n' '${rootDir}' | \
    firebase apphosting:backends:create \
      --backend ${backendId} \
      --project ${projectId} \
      --primary-region ${region}${appFlag}
  do

    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
      echo "Backend creation failed after retries."
      exit 1
    fi

    SLEEP_TIME=$((ATTEMPT * 10))

    echo "Backend creation failed. Retrying in \${SLEEP_TIME}s..."

    sleep \${SLEEP_TIME}

    ATTEMPT=$((ATTEMPT + 1))
  done

  echo "Waiting for backend readiness..."

  READY_ATTEMPT=1
  READY_MAX_ATTEMPTS=30

  until firebase apphosting:backends:get ${backendId} \
    --project ${projectId} \
    --json | grep -q '"uri"'
  do

    if [ $READY_ATTEMPT -ge $READY_MAX_ATTEMPTS ]; then
      echo "Backend readiness timed out."
      exit 1
    fi

    echo "Backend not ready yet. Waiting..."

    sleep 10

    READY_ATTEMPT=$((READY_ATTEMPT + 1))
  done

  echo "Backend ${backendId} is ready."
fi
`,
  ];
}

async function prepareFirebaseApphostingSource(
  source: Directory,
  rootDir: string,
  projectId: string,
  appId?: string,
  webappConfig?: Secret,
  extraEnv?: Secret,
  nodeAuthToken?: Secret,
  registryScope?: string,
): Promise<Directory> {
  const directories = [rootDir].filter(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );

  const installed = await installFirebaseDependencies(source, directories, {
    nodeAuthToken,
    registryScope,
  });

  return buildFirebaseProjects(installed, directories, {
    frontendDir: rootDir,
    projectId,
    appId,
    webappConfig,
    extraEnv,
  });
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

  const deployed = authenticated.withExec([
    "firebase",
    "deploy",
    "--only",
    `apphosting:${backendId}`,
    "--project",
    projectId,
    "--non-interactive",
    "--force",
  ]);

  const backendJson = await deployed
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

export async function deployFirebaseApphostingPipeline(
  source: Directory,
  projectId: string,
  backendId: string,
  rootDir = ".",
  appId = "",
  region = "asia-southeast1",
  gcpCredentials?: Secret,
  webappConfig?: Secret,
  extraEnv?: Secret,
  nodeAuthToken?: Secret,
  registryScope?: string,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Promise<string> {
  const prepared = await prepareFirebaseApphostingSource(
    source,
    rootDir,
    projectId,
    appId,
    webappConfig,
    extraEnv,
    nodeAuthToken,
    registryScope,
  );

  return deployFirebaseApphostingProject(
    prepared,
    projectId,
    backendId,
    rootDir,
    appId,
    region,
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
  );
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
