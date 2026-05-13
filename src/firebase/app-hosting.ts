import { Container, Directory, Secret } from "@dagger.io/dagger";
import { firebaseAppHostingBase, firebaseNodeBase } from "./base.js";
import { buildFirebaseProjects } from "./build.js";
import type { FirebaseBuildProfile } from "./env.js";
import {
  FIREBASE_WIF_CREDENTIALS_PATH,
  FIREBASE_WIF_OIDC_TOKEN_PATH,
  FIREBASE_WORKDIR,
  GCP_CREDENTIALS_PATH,
} from "./constants.js";
import { installFirebaseDependencies } from "./dependencies.js";
import { shellQuote } from "../shared/path-utils.js";

function withAppRootLockfile(
  source: Directory,
  rootDir: string,
  lockfileSource: Directory,
): Directory {
  const normalizedRootDir = rootDir.trim();

  if (!normalizedRootDir || normalizedRootDir === ".") {
    return source;
  }

  return firebaseNodeBase()
    .withDirectory(FIREBASE_WORKDIR, source)
    .withFile(
      `${FIREBASE_WORKDIR}/${normalizedRootDir}/package-lock.json`,
      lockfileSource.file("package-lock.json"),
    )
    .directory(FIREBASE_WORKDIR);
}

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

function backendExistsCommand(
  projectId: string,
  backendId: string,
  appId: string,
  region: string,
  rootDir: string,
): string[] {
  const appFlag = appId ? ` --app ${shellQuote(appId)}` : "";

  return [
    "bash",
    "-c",
    `
set -euo pipefail

BACKEND_JSON=$(firebase apphosting:backends:get ${shellQuote(backendId)} \
  --project ${shellQuote(projectId)} \
  --json 2>/dev/null || true)

if echo "$BACKEND_JSON" | grep -q '"uri"'; then

  echo "Backend ${backendId} already exists and is healthy."

else

  echo "Backend ${backendId} missing or invalid. Creating..."

  ATTEMPT=1
  MAX_ATTEMPTS=5

  until (
    printf '%s\n' ${shellQuote(rootDir)} | firebase apphosting:backends:create \
      --backend ${shellQuote(backendId)} \
      --project ${shellQuote(projectId)} \
      --primary-region ${shellQuote(region)}${appFlag}
  )
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

  until firebase apphosting:backends:get ${shellQuote(backendId)} \
    --project ${shellQuote(projectId)} \
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

function writeFirebaseApphostingConfigCommand(
  backendId: string,
  rootDir: string,
): string[] {
  return [
    "bash",
    "-lc",
    `
set -euo pipefail

node <<'EOF'
const fs = require('node:fs');
const path = '${FIREBASE_WORKDIR}/firebase.json';
const backendId = ${JSON.stringify(backendId)};
const rootDir = ${JSON.stringify(rootDir)};

const current = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, 'utf8'))
  : {};
const apphosting = Array.isArray(current.apphosting) ? current.apphosting : [];
const nextEntry = { backendId, rootDir };
const index = apphosting.findIndex(
  (entry) => entry && entry.backendId === backendId,
);

if (index >= 0) {
  apphosting[index] = nextEntry;
} else {
  apphosting.push(nextEntry);
}

current.apphosting = apphosting;
fs.writeFileSync(path, JSON.stringify(current, null, 2) + '\\n');
EOF
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
  buildProfile: FirebaseBuildProfile = "staystack",
  functionsRegion?: string,
  functionsBaseUrl?: string,
  accessActor?: string,
  accessVia?: string,
  buildLabel?: string,
  remoteConfigMode?: string,
): Promise<Directory> {
  const installed = await installFirebaseDependencies(source, ["."], {
    nodeAuthToken,
    registryScope,
  });

  const built = await buildFirebaseProjects(installed, [rootDir], {
    buildProfile,
    frontendDir: rootDir,
    projectId,
    appId,
    webappConfig,
    extraEnv,
    functionsRegion,
    functionsBaseUrl,
    accessActor,
    accessVia,
    buildLabel,
    remoteConfigMode,
  });

  return withAppRootLockfile(built, rootDir, source);
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
    .withExec(writeFirebaseApphostingConfigCommand(backendId, rootDir));

  const authenticated = withAppHostingAuth(
    prepared,
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
  ).withExec(backendExistsCommand(projectId, backendId, appId, region, rootDir));

  const deployed = authenticated.withExec([
    "bash",
    "-c",
    `
set -euo pipefail

ATTEMPT=1
MAX_ATTEMPTS=5

until firebase deploy \
  --only apphosting:${shellQuote(backendId)} \
  --project ${shellQuote(projectId)} \
  --non-interactive \
  --force
do

  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "Deployment failed after retries."
    exit 1
  fi

  SLEEP_TIME=$((ATTEMPT * 10))

  echo "Deployment failed due to concurrent run or transient issue."
  echo "Retrying in \${SLEEP_TIME}s..."

  sleep \${SLEEP_TIME}

  ATTEMPT=$((ATTEMPT + 1))
done

echo "Deployment completed successfully."
`,
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
  buildProfile: FirebaseBuildProfile = "staystack",
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
    buildProfile,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
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
