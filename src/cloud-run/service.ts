import { Container, Directory, Secret, dag } from "@dagger.io/dagger";
import {
  DEFAULT_REGISTRY_SCOPE,
  DEFAULT_WORKSPACE,
  STRICT_SHELL_HEADER,
} from "../shared/constants.js";
import { withFullSource } from "../shared/npm.js";
import { resolveWorkspacePath, shellQuote } from "../shared/path-utils.js";
import { runNpmScript } from "../shared/scripts.js";
import { createNodeWorkspace } from "../shared/workspace.js";

const CLOUD_RUN_CREDENTIALS_PATH = "/auth/gcp-credentials.json";
const CLOUD_RUN_ENV_PATH = "/tmp/vite-config.env";
const CLOUD_RUN_PORT = "8080";
const CLOUD_RUN_STATIC_ROOT = "/usr/share/nginx/html";
const CLOUD_RUN_NGINX_CONF_PATH = "/etc/nginx/conf.d/default.conf";
const CLOUD_RUN_DEPLOY_IMAGE = "gcr.io/google.com/cloudsdktool/google-cloud-cli:slim";
const CLOUD_RUN_RUNTIME_IMAGE = "nginx:1.27-alpine";
const CLOUD_RUN_REGISTRY_USERNAME = "_json_key_base64";

export type CloudRunStaticSiteOptions = {
  frontendDir?: string;
  buildScript?: string;
  distDir?: string;
  imageName?: string;
  imageTag?: string;
  nodeAuthToken?: Secret;
  registryScope?: string;
  allowUnauthenticated?: boolean;
  registryRegion?: string;
};

function formatEnvValue(value: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value);
}

function parseViteConfigPayload(raw: string): Record<string, string> {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("viteConfig secret must contain a non-empty JSON object.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("viteConfig secret must be valid JSON.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("viteConfig secret must be a JSON object.");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);

  if (entries.length === 0) {
    throw new Error("viteConfig secret must define at least one VITE_* entry.");
  }

  const envEntries: Record<string, string> = {};

  for (const [key, value] of entries) {
    if (!key.startsWith("VITE_")) {
      throw new Error(`viteConfig key '${key}' must start with 'VITE_'.`);
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`viteConfig key '${key}' must have a non-empty string value.`);
    }

    envEntries[key] = value;
  }

  return envEntries;
}

async function createViteEnvSecret(viteConfig: Secret): Promise<Secret> {
  const payload = parseViteConfigPayload(await viteConfig.plaintext());
  const envContent = `${Object.entries(payload)
    .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    .join("\n")}\n`;

  return dag.setSecret("vite-config-env", envContent);
}

function withViteEnv(
  container: Container,
  frontendDir: string,
  viteEnv: Secret,
): Container {
  const appDir = resolveWorkspacePath(DEFAULT_WORKSPACE, frontendDir);

  return container
    .withMountedSecret(CLOUD_RUN_ENV_PATH, viteEnv)
    .withExec([
      "bash",
      "-lc",
      [
        STRICT_SHELL_HEADER,
        `cd ${shellQuote(appDir)}`,
        `cp ${shellQuote(CLOUD_RUN_ENV_PATH)} .env.production`,
      ].join("\n"),
    ]);
}

function runtimeNginxConfig(): string {
  return [
    "server {",
    `  listen ${CLOUD_RUN_PORT};`,
    "  server_name _;",
    `  root ${CLOUD_RUN_STATIC_ROOT};`,
    "  index index.html;",
    "",
    "  location / {",
    "    try_files $uri $uri/ /index.html;",
    "  }",
    "}",
    "",
  ].join("\n");
}

function buildDistPath(frontendDir: string, distDir: string): string {
  return resolveWorkspacePath(
    DEFAULT_WORKSPACE,
    frontendDir === "." ? distDir : `${frontendDir}/${distDir}`,
  );
}

export function createCloudRunRuntimeContainer(dist: Directory): Container {
  return dag
    .container()
    .from(CLOUD_RUN_RUNTIME_IMAGE)
    .withEnvVariable("PORT", CLOUD_RUN_PORT)
    .withEnvVariable("NODE_ENV", "production")
    .withDirectory(CLOUD_RUN_STATIC_ROOT, dist)
    .withNewFile(CLOUD_RUN_NGINX_CONF_PATH, runtimeNginxConfig());
}

export async function publishCloudRunContainer(
  container: Container,
  imageRef: string,
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
): Promise<string> {
  const registryAddress = registryAddressFromImageRef(imageRef);
  let username = "";
  let passwordSecret: Secret;

  if (gcpCredentials) {
    const credentials = await gcpCredentials.plaintext();
    username = CLOUD_RUN_REGISTRY_USERNAME;
    passwordSecret = dag.setSecret(
      "artifact-registry-password",
      Buffer.from(credentials, "utf8").toString("base64"),
    );
  } else if (wifProvider && wifServiceAccount && wifOidcToken) {
    // Exchange OIDC token for GCP access token
    const tokenContainer = withCloudRunAuth(
      dag.container().from(CLOUD_RUN_DEPLOY_IMAGE),
      undefined,
      "dummy-project",
      wifProvider,
      wifServiceAccount,
      wifOidcToken,
    );
    const accessToken = await tokenContainer
      .withExec(["gcloud", "auth", "print-access-token"])
      .stdout();

    username = "oauth2accesstoken";
    passwordSecret = dag.setSecret(
      "artifact-registry-access-token",
      accessToken.trim(),
    );
  } else {
    throw new Error(
      "Either gcpCredentials or (wifProvider, wifServiceAccount, wifOidcToken) must be provided for publishing.",
    );
  }

  return container
    .withRegistryAuth(registryAddress, username, passwordSecret)
    .publish(imageRef);
}

export function withCloudRunAuth(
  container: Container,
  gcpCredentials?: Secret,
  projectId?: string,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Container {
  let authContainer = container;

  if (gcpCredentials) {
    authContainer = authContainer
      .withMountedSecret(CLOUD_RUN_CREDENTIALS_PATH, gcpCredentials)
      .withEnvVariable(
        "GOOGLE_APPLICATION_CREDENTIALS",
        CLOUD_RUN_CREDENTIALS_PATH,
      )
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        CLOUD_RUN_CREDENTIALS_PATH,
      )
      .withExec([
        "gcloud",
        "auth",
        "activate-service-account",
        "--key-file",
        CLOUD_RUN_CREDENTIALS_PATH,
      ]);
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

    authContainer = authContainer
      .withMountedSecret("/tmp/oidc-token.txt", wifOidcToken)
      .withNewFile("/tmp/wif-credentials.json", `${credentialsPayload}\n`)
      .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/wif-credentials.json")
      .withEnvVariable(
        "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
        "/tmp/wif-credentials.json",
      );
  }

  if (projectId) {
    authContainer = authContainer.withExec([
      "gcloud",
      "config",
      "set",
      "project",
      projectId,
    ]);
  }

  return authContainer;
}

async function buildStaticSiteDist(
  source: Directory,
  viteConfig: Secret,
  options: CloudRunStaticSiteOptions = {},
): Promise<Directory> {
  const frontendDir = options.frontendDir?.trim() || ".";
  const buildScript = options.buildScript?.trim() || "build";
  const distDir = options.distDir?.trim() || "dist";
  const viteEnv = await createViteEnvSecret(viteConfig);

  let container = createNodeWorkspace(source, options.nodeAuthToken, {
    packagePaths: frontendDir,
    registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    workspace: DEFAULT_WORKSPACE,
    withPlaywrightCache: false,
  });

  container = withFullSource(container, source, {
    workspace: DEFAULT_WORKSPACE,
    strategy: "overlay",
  });
  container = withViteEnv(container, frontendDir, viteEnv);
  container = runNpmScript(container, buildScript, {
    cwd: frontendDir,
    workspace: DEFAULT_WORKSPACE,
  });

  const distPath = buildDistPath(frontendDir, distDir);

  await container.stat(distPath);

  return container.directory(distPath);
}

function buildImageRef(
  projectId: string,
  service: string,
  region: string,
  repository: string,
  options: CloudRunStaticSiteOptions = {},
): string {
  const registryRegion = options.registryRegion?.trim() || region;
  const imageName = options.imageName?.trim() || service;
  const imageTag = options.imageTag?.trim() || "latest";

  return `${registryRegion}-docker.pkg.dev/${projectId}/${repository}/${imageName}:${imageTag}`;
}

function registryAddressFromImageRef(imageRef: string): string {
  const [registryAddress, ...pathParts] = imageRef.split("/");

  if (!registryAddress || pathParts.length < 3) {
    throw new Error(
      "Cloud Run image reference must include registry host, project, repository, and image name.",
    );
  }

  return registryAddress;
}

/**
 * Builds a Vite application inside Dagger, publishes a Cloud Run container image,
 * and deploys the service from that image.
 */
export async function deployCloudRunStaticSitePipeline(
  source: Directory,
  projectId: string,
  service: string,
  region: string,
  repository: string,
  gcpCredentials?: Secret,
  viteConfig?: Secret,
  options: CloudRunStaticSiteOptions & {
    wifProvider?: string;
    wifServiceAccount?: string;
    wifOidcToken?: Secret;
    wifAudience?: string;
  } = {},
): Promise<string> {
  if (!viteConfig) {
    throw new Error("viteConfig is required for 'deploy' action");
  }
  const dist = await buildStaticSiteDist(source, viteConfig, options);
  const imageRef = buildImageRef(projectId, service, region, repository, options);
  const runtimeContainer = createCloudRunRuntimeContainer(dist);
  const publishedRef = await publishCloudRunContainer(
    runtimeContainer,
    imageRef,
    gcpCredentials,
    options.wifProvider,
    options.wifServiceAccount,
    options.wifOidcToken,
  );
  const allowUnauthenticated = options.allowUnauthenticated ?? true;

  const cmd = [
    "gcloud",
    "run",
    "deploy",
    service,
    "--image",
    publishedRef,
    "--region",
    region,
    "--project",
    projectId,
    "--platform",
    "managed",
    "--port",
    CLOUD_RUN_PORT,
    "--quiet",
    allowUnauthenticated ? "--allow-unauthenticated" : "--no-allow-unauthenticated",
  ];

  const deployed = withCloudRunAuth(
    dag.container().from(CLOUD_RUN_DEPLOY_IMAGE),
    gcpCredentials,
    projectId,
    options.wifProvider,
    options.wifServiceAccount,
    options.wifOidcToken,
    options.wifAudience,
  ).withExec(cmd);

  return deployed
    .withExec([
      "gcloud",
      "run",
      "services",
      "describe",
      service,
      "--region",
      region,
      "--project",
      projectId,
      "--format=value(status.url)",
    ])
    .stdout();
}

/**
 * Deletes a Cloud Run service used for preview or environment lifecycle cleanup.
 */
export async function deleteCloudRunService(
  projectId: string,
  service: string,
  region: string,
  gcpCredentials?: Secret,
  wifProvider = "",
  wifServiceAccount = "",
  wifOidcToken?: Secret,
  wifAudience = "",
): Promise<string> {
  return withCloudRunAuth(
    dag.container().from(CLOUD_RUN_DEPLOY_IMAGE),
    gcpCredentials,
    projectId,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    wifAudience,
  )
    .withExec([
      "gcloud",
      "run",
      "services",
      "delete",
      service,
      "--region",
      region,
      "--project",
      projectId,
      "--quiet",
    ])
    .stdout();
}
