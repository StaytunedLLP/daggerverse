import { Container, Directory, Secret, dag } from "@dagger.io/dagger";
import { firebaseAppHostingBase } from "./base.js";
import {
  FIREBASE_WIF_CREDENTIALS_PATH,
  FIREBASE_WIF_OIDC_TOKEN_PATH,
  FIREBASE_WORKDIR,
  GCP_CREDENTIALS_PATH,
} from "./constants.js";
import { shellQuote } from "../shared/path-utils.js";
import { withFrontendEnv } from "./env.js";
import {
  createCloudRunRuntimeContainer,
  publishCloudRunContainer,
  withCloudRunAuth,
} from "../cloud-run/service.js";
import {
  DEFAULT_REGISTRY_SCOPE,
  DEFAULT_WORKSPACE,
} from "../shared/constants.js";
import { withFullSource } from "../shared/npm.js";
import { resolveWorkspacePath } from "../shared/path-utils.js";
import { runNpmScript } from "../shared/scripts.js";
import { createNodeWorkspace } from "../shared/workspace.js";

export type FirebaseDeployApphostingOptions = {
  gcpCredentials?: Secret;
  gcpToken?: Secret;
  wifProvider?: string;
  wifServiceAccount?: string;
  wifOidcToken?: Secret;
  wifAudience?: string;
  webappConfig?: Secret;
  extraEnv?: Secret;
  buildScript?: string;
  distDir?: string;
  repository?: string;
  imageTag?: string;
  nodeAuthToken?: Secret;
  registryScope?: string;
  targetEnv?: string;
  firebaseEnv?: string;
  firestoreDatabaseId?: string;
  functionsRegion?: string;
};

async function withAppHostingAuth(
  container: Container,
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
  gcpToken?: Secret,
): Promise<Container> {
  if (gcpToken) {
    const token = await gcpToken.plaintext();
    return container
      .withEnvVariable("GOOGLE_OAUTH_ACCESS_TOKEN", token)
      .withEnvVariable("FIREBASE_TOKEN", token)
      .withEnvVariable("CLOUDSDK_AUTH_ACCESS_TOKEN", token);
  }

  let isWif = false;
  if (gcpCredentials) {
    const credentials = await gcpCredentials.plaintext();
    if (credentials.includes("external_account")) {
      isWif = true;
    } else {
      return container
        .withMountedSecret(GCP_CREDENTIALS_PATH, gcpCredentials)
        .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", GCP_CREDENTIALS_PATH)
        .withEnvVariable(
          "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
          GCP_CREDENTIALS_PATH,
        )
        .withoutEnvVariable("FIREBASE_TOKEN");
    }
  }

  if (isWif || (wifProvider && wifServiceAccount && wifOidcToken)) {
    const resolvedAudience =
      wifAudience.trim() || `//iam.googleapis.com/${wifProvider.trim()}`;
    const credentialsPayload =
      isWif && gcpCredentials
        ? await gcpCredentials.plaintext()
        : JSON.stringify(
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

    // Exchange OIDC token for a real access token using gcloud
    const tokenContainer = dag
      .container()
      .from("gcr.io/google.com/cloudsdktool/google-cloud-cli:slim")
      .withMountedSecret(
        FIREBASE_WIF_OIDC_TOKEN_PATH,
        wifOidcToken ?? dag.setSecret("dummy", ""),
      )
      .withNewFile(FIREBASE_WIF_CREDENTIALS_PATH, `${credentialsPayload}\n`)
      .withEnvVariable(
        "GOOGLE_APPLICATION_CREDENTIALS",
        FIREBASE_WIF_CREDENTIALS_PATH,
      )
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        FIREBASE_WIF_CREDENTIALS_PATH,
      )
      .withExec([
        "gcloud",
        "auth",
        "login",
        `--cred-file=${FIREBASE_WIF_CREDENTIALS_PATH}`,
      ]);

    const accessToken = await tokenContainer
      .withExec(["gcloud", "auth", "print-access-token"])
      .stdout();

    return container
      .withEnvVariable("GOOGLE_OAUTH_ACCESS_TOKEN", accessToken.trim())
      .withEnvVariable("FIREBASE_TOKEN", accessToken.trim())
      .withEnvVariable("CLOUDSDK_AUTH_ACCESS_TOKEN", accessToken.trim());
  }

  return container;
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
  webappConfig?: Secret,
  extraEnv?: Secret,
  targetEnv?: string,
  firebaseEnv?: string,
  firestoreDatabaseId?: string,
  functionsRegion?: string,
  gcpToken?: Secret,
): Promise<string> {
  let prepared = firebaseAppHostingBase()
    .withDirectory(FIREBASE_WORKDIR, source)
    .withWorkdir(FIREBASE_WORKDIR)
    .withNewFile(
      `${FIREBASE_WORKDIR}/firebase.json`,
      `${appHostingConfig(backendId, rootDir)}\n`,
    );

  // Apply environment mapping if requested
  prepared = await withFrontendEnv(prepared, {
    frontendDir: rootDir,
    projectId,
    appId,
    webappConfig,
    extraEnv,
    targetEnv,
    firebaseEnv,
    firestoreDatabaseId,
    functionsRegion,
  });

  const authenticated = await withAppHostingAuth(
    prepared,
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
    gcpToken,
  );
  
  const authenticatedWithExec = authenticated.withExec(backendExistsCommand(projectId, backendId, appId, region));

  const backendJson = await authenticatedWithExec
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
  gcpToken?: Secret,
): Promise<string> {
  const container = await withAppHostingAuth(
    firebaseAppHostingBase(),
    gcpCredentials,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
    gcpToken,
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

/**
 * Builds the application with mapped environment variables.
 */
async function buildApphostingDist(
  source: Directory,
  projectId: string,
  options: FirebaseDeployApphostingOptions = {},
): Promise<Directory> {
  const rootDir = ".";
  const buildScript = options.buildScript?.trim() || "build";
  const distDir = options.distDir?.trim() || "dist";

  // Create workspace and install dependencies
  let container = createNodeWorkspace(source, options.nodeAuthToken, {
    packagePaths: rootDir,
    registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    workspace: DEFAULT_WORKSPACE,
    withPlaywrightCache: false,
  });

  // Inject full source
  container = withFullSource(container, source, {
    workspace: DEFAULT_WORKSPACE,
    strategy: "overlay",
  });

  // Apply environment mapping (This is where .env is created)
  container = await withFrontendEnv(container, {
    ...options,
    projectId,
    frontendDir: rootDir,
  });

  // Run build
  container = runNpmScript(
    container.withEnvVariable("CACHE_BUST", Date.now().toString()),
    buildScript,
    {
      cwd: rootDir,
      workspace: DEFAULT_WORKSPACE,
    }
  );

  const distPath = resolveWorkspacePath(DEFAULT_WORKSPACE, distDir);
  return container.directory(distPath);
}

/**
 * Full pipeline: Build assets -> Publish Docker Image -> Deploy to Cloud Run (for App Hosting).
 */
export async function firebaseApphostingPipeline(
  source: Directory,
  projectId: string,
  backendId: string,
  appId: string,
  region: string,
  gcpCredentials?: Secret,
  options: FirebaseDeployApphostingOptions = {},
): Promise<string> {
  // 1. Ensure backend exists in Firebase (metadata management)
  await deployFirebaseApphostingProject(
    source,
    projectId,
    backendId,
    ".", // rootDir
    appId,
    region,
    gcpCredentials,
    options.wifProvider,
    options.wifServiceAccount,
    options.wifOidcToken,
    options.wifAudience,
    options.webappConfig,
    options.extraEnv,
    options.targetEnv,
    options.firebaseEnv,
    options.firestoreDatabaseId,
    options.functionsRegion,
    options.gcpToken,
  );

  // 2. Build the distribution with correct ENVs
  const dist = await buildApphostingDist(source, projectId, options);

  // 3. Create and publish the runtime container
  // We use the backendId as the service name and the targetEnv as the repository name
  // to match the user's reference YAML pattern.
  const repository = options.targetEnv || "previews";
  const imageTag = options.imageTag || "latest";
  const imageRef = `${region}-docker.pkg.dev/${projectId}/${repository}/${backendId}:${imageTag}`;

  const runtimeContainer = createCloudRunRuntimeContainer(dist);

  const publishedRef = await publishCloudRunContainer(
    runtimeContainer,
    imageRef,
    gcpCredentials,
    options.wifProvider,
    options.wifServiceAccount,
    options.wifOidcToken,
    options.gcpToken,
  );

  // 4. Deploy the image to Cloud Run (which powers the App Hosting backend)
  const revisionSuffix = `v${Date.now()}`;
  const deployCmd = [
    "gcloud",
    "run",
    "deploy",
    backendId,
    "--image",
    publishedRef,
    "--region",
    region,
    "--project",
    projectId,
    "--platform",
    "managed",
    "--port",
    "8080",
    "--revision-suffix",
    revisionSuffix,
    "--update-env-vars",
    `STAYDEVOPS_DEPLOY_ID=${Date.now()}`,
    "--quiet",
    "--allow-unauthenticated",
  ];

  const deployer = await withAppHostingAuth(
    dag.container().from("gcr.io/google.com/cloudsdktool/google-cloud-cli:slim"),
    gcpCredentials,
    options.wifProvider ?? "",
    options.wifServiceAccount ?? "",
    options.wifOidcToken,
    options.wifAudience ?? "",
    options.gcpToken,
  );

  return deployer
    .withEnvVariable("DEPLOY_CACHE_BUST", Date.now().toString())
    .withExec(deployCmd)
    .withExec([
      "gcloud",
      "run",
      "services",
      "describe",
      backendId,
      "--region",
      region,
      "--project",
      projectId,
      "--format=value(status.url)",
    ])
    .stdout();
}
