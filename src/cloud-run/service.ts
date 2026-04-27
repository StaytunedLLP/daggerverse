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
  gcpCredentials: Secret,
): Promise<string> {
  const credentials = await gcpCredentials.plaintext();
  let parsedCredentials: Record<string, unknown>;

  try {
    parsedCredentials = JSON.parse(credentials) as Record<string, unknown>;
  } catch {
    throw new Error("gcpCredentials secret must contain valid JSON credentials.");
  }

  const requiredFields = ["type", "client_email", "private_key"];

  for (const field of requiredFields) {
    if (typeof parsedCredentials[field] !== "string") {
      throw new Error(
        `The gcpCredentials secret must be a GCP JSON credentials document with '${field}'.`,
      );
    }
  }

  const registryAddress = registryAddressFromImageRef(imageRef);
  const registryPassword = dag.setSecret(
    "artifact-registry-password",
    Buffer.from(credentials, "utf8").toString("base64"),
  );

  return container.withRegistryAuth(
    registryAddress,
    CLOUD_RUN_REGISTRY_USERNAME,
    registryPassword,
  )
    .publish(imageRef);
}

export function withCloudRunAuth(
  container: Container,
  gcpCredentials: Secret,
  projectId: string,
): Container {
  return container
    .withMountedSecret(CLOUD_RUN_CREDENTIALS_PATH, gcpCredentials)
    .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", CLOUD_RUN_CREDENTIALS_PATH)
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
    ])
    .withExec(["gcloud", "config", "set", "project", projectId]);
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
  gcpCredentials: Secret,
  viteConfig: Secret,
  options: CloudRunStaticSiteOptions = {},
): Promise<string> {
  const dist = await buildStaticSiteDist(source, viteConfig, options);
  const imageRef = buildImageRef(projectId, service, region, repository, options);
  const runtimeContainer = createCloudRunRuntimeContainer(dist);
  const publishedRef = await publishCloudRunContainer(
    runtimeContainer,
    imageRef,
    gcpCredentials,
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
  gcpCredentials: Secret,
): Promise<string> {
  return withCloudRunAuth(
    dag.container().from(CLOUD_RUN_DEPLOY_IMAGE),
    gcpCredentials,
    projectId,
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
