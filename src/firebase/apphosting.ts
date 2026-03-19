import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { Container, Directory, Secret } from "@dagger.io/dagger";
import { DEFAULT_REGISTRY_SCOPE } from "../shared/constants.js";
import { maybeResolveNodeAuthToken } from "../shared/auth.js";
import { withTerraformCli } from "../shared/install.js";
import { withNpmAuth } from "../shared/npm.js";
import { firebaseCliBase, firebaseNodeBase } from "./base.js";
import {
  FIREBASE_APPHOSTING_CONFIG_NAME,
  FIREBASE_WIF_CREDENTIALS_PATH,
  FIREBASE_WIF_OIDC_TOKEN_PATH,
  FIREBASE_WORKDIR,
} from "./constants.js";

const APPHOSTING_BUILD_ENV_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-build-env.mjs";
const APPHOSTING_VALIDATE_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-validate.mjs";
const APPHOSTING_BUILD_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-build.sh";
const APPHOSTING_CONFIG_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-config.mjs";
const APPHOSTING_ACTION_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-action.mjs";
const APPHOSTING_TERRAFORM_RUNTIME_PATH =
  "/usr/local/bin/staydevops-apphosting-terraform.mjs";

export type FirebaseDeployApphostingOptions = {
  firebaseDir?: string;
  buildEnv?: Secret;
  nodeAuthToken?: Secret;
  registryScope?: string;
  skipDeploy?: boolean;
  allowMissingBackend?: boolean;
  createPreviewBackend?: boolean;
  deletePreviewBackend?: boolean;
  appId?: string;
  region?: string;
  wifAudience?: string;
};

export type FirebaseApphostingTerraformOptions = {
  terraformDir?: string;
  region?: string;
  serviceAccountEmail?: string;
  firebaseWebappConfig?: Secret;
  wifAudience?: string;
};

type InstallTarget = {
  entries: string[];
  path: string;
};

function withExecutableScript(
  container: Container,
  path: string,
  contents: string,
): Container {
  return container.withNewFile(path, contents, { permissions: 0o755 });
}

function buildInvocationShellScript(command: string): string {
  return `#!/bin/bash
set -euo pipefail

${command}
`;
}

function loadBundledScript(name: string): string {
  return readFileSync(new URL(`./scripts/${name}.js`, import.meta.url), "utf8");
}

async function resolveInstallTarget(
  source: Directory,
  rootDir: string,
): Promise<InstallTarget | undefined> {
  const workspaceEntries = await source.entries();

  if (workspaceEntries.includes("package.json")) {
    return {
      path: ".",
      entries: workspaceEntries,
    };
  }

  const trimmedRootDir = rootDir.trim();
  if (!trimmedRootDir || trimmedRootDir === ".") {
    return undefined;
  }

  const targetDir = source.directory(trimmedRootDir);
  const targetEntries = await targetDir.entries();

  if (!targetEntries.includes("package.json")) {
    return undefined;
  }

  return {
    path: trimmedRootDir,
    entries: targetEntries,
  };
}

function withWifAuth(
  container: Container,
  wifProvider: string,
  wifServiceAccount: string,
  wifOidcToken: Secret,
  audience?: string,
): Container {
  const trimmedProvider = wifProvider.trim();
  const trimmedServiceAccount = wifServiceAccount.trim();

  if (!trimmedProvider) {
    throw new Error("wifProvider is required");
  }

  if (!trimmedServiceAccount) {
    throw new Error("wifServiceAccount is required");
  }

  const resolvedAudience =
    audience?.trim() || `//iam.googleapis.com/${trimmedProvider}`;
  const credentials = JSON.stringify(
    {
      type: "external_account",
      audience: resolvedAudience,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${trimmedServiceAccount}:generateAccessToken`,
      credential_source: {
        file: FIREBASE_WIF_OIDC_TOKEN_PATH,
      },
    },
    null,
    2,
  );

  return container
    .withMountedSecret(FIREBASE_WIF_OIDC_TOKEN_PATH, wifOidcToken)
    .withNewFile(FIREBASE_WIF_CREDENTIALS_PATH, `${credentials}\n`)
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

function withInstalledApphostingDependencies(
  container: Container,
  installTarget: InstallTarget | undefined,
): Container {
  if (!installTarget) {
    return container;
  }

  if (!installTarget.entries.includes("package-lock.json")) {
    const lockfilePath =
      installTarget.path === "." ?
        `${FIREBASE_WORKDIR}/package-lock.json`
      : `${FIREBASE_WORKDIR}/${installTarget.path}/package-lock.json`;
    throw new Error(`Missing ${lockfilePath}`);
  }

  const installDir =
    installTarget.path === "." ?
      FIREBASE_WORKDIR
    : `${FIREBASE_WORKDIR}/${installTarget.path}`;

  return container.withWorkdir(installDir).withExec(["npm", "ci"]);
}

function withApphostingScripts(container: Container): Container {
  return withExecutableScript(
    withExecutableScript(
      withExecutableScript(
        withExecutableScript(
          container,
          APPHOSTING_BUILD_ENV_RUNTIME_PATH,
          loadBundledScript("build-env"),
        ),
        APPHOSTING_VALIDATE_RUNTIME_PATH,
        loadBundledScript("validate-apphosting-inputs"),
      ),
      APPHOSTING_CONFIG_RUNTIME_PATH,
      loadBundledScript("generate-apphosting-config"),
    ),
    APPHOSTING_ACTION_RUNTIME_PATH,
    loadBundledScript("resolve-apphosting-action"),
  );
}

function withBuildCommandScript(
  container: Container,
  buildCommand: string,
): Container {
  return withExecutableScript(
    container,
    APPHOSTING_BUILD_RUNTIME_PATH,
    buildInvocationShellScript(buildCommand),
  );
}

function withBuildEnv(container: Container, buildEnv?: Secret): Container {
  if (!buildEnv) {
    return container;
  }

  return container
    .withSecretVariable("BUILD_ENV_SECRET", buildEnv)
    .withWorkdir(FIREBASE_WORKDIR)
    .withExec(["node", APPHOSTING_BUILD_ENV_RUNTIME_PATH]);
}

function withApphostingBuildPreparation(
  container: Container,
  backendId: string,
  rootDir: string,
  firebaseDir?: string,
): Container {
  return container
    .withEnvVariable("APPHOSTING_BACKEND_ID", backendId)
    .withEnvVariable("APPHOSTING_ROOT_DIR", rootDir)
    .withEnvVariable("APPHOSTING_FIREBASE_DIR", firebaseDir?.trim() || ".")
    .withEnvVariable("APPHOSTING_CONFIG_NAME", FIREBASE_APPHOSTING_CONFIG_NAME)
    .withWorkdir(FIREBASE_WORKDIR)
    .withExec(["node", APPHOSTING_VALIDATE_RUNTIME_PATH])
    .withExec([APPHOSTING_BUILD_RUNTIME_PATH])
    .withExec(["node", APPHOSTING_CONFIG_RUNTIME_PATH]);
}

function withResolvedApphostingAction(
  container: Container,
  projectId: string,
  backendId: string,
  options: FirebaseDeployApphostingOptions = {},
): Container {
  const deployDir =
    options.firebaseDir?.trim() ?
      `${FIREBASE_WORKDIR}/${options.firebaseDir.trim()}`
    : FIREBASE_WORKDIR;

  return container
    .withEnvVariable("APPHOSTING_PROJECT_ID", projectId)
    .withEnvVariable("APPHOSTING_BACKEND_ID", backendId)
    .withEnvVariable(
      "APPHOSTING_SKIP_DEPLOY",
      options.skipDeploy ? "true" : "false",
    )
    .withEnvVariable(
      "APPHOSTING_ALLOW_MISSING",
      options.allowMissingBackend ? "true" : "false",
    )
    .withEnvVariable(
      "APPHOSTING_CREATE_BACKEND",
      options.createPreviewBackend ? "true" : "false",
    )
    .withEnvVariable(
      "APPHOSTING_DELETE_PREVIEW_BACKEND",
      options.deletePreviewBackend ? "true" : "false",
    )
    .withEnvVariable("APPHOSTING_APP_ID", options.appId?.trim() || "")
    .withEnvVariable(
      "APPHOSTING_REGION",
      options.region?.trim() || "asia-southeast1",
    )
    .withEnvVariable(
      "APPHOSTING_CONFIG_PATH",
      `${deployDir}/${FIREBASE_APPHOSTING_CONFIG_NAME}`,
    )
    .withWorkdir(deployDir)
    .withExec([
      "node",
      APPHOSTING_ACTION_RUNTIME_PATH,
      "--project-id",
      projectId,
      "--backend-id",
      backendId,
      "--config-path",
      `${deployDir}/${FIREBASE_APPHOSTING_CONFIG_NAME}`,
      "--skip-deploy",
      options.skipDeploy ? "true" : "false",
      "--allow-missing",
      options.allowMissingBackend ? "true" : "false",
      "--create-backend",
      options.createPreviewBackend ? "true" : "false",
      "--delete-preview-backend",
      options.deletePreviewBackend ? "true" : "false",
      "--app-id",
      options.appId?.trim() || "",
      "--region",
      options.region?.trim() || "asia-southeast1",
    ]);
}

export async function firebaseDeployApphostingPipeline(
  source: Directory,
  projectId: string,
  backendId: string,
  rootDir: string,
  buildCommand: string,
  wifProvider: string,
  wifServiceAccount: string,
  wifOidcToken: Secret,
  options: FirebaseDeployApphostingOptions = {},
): Promise<string> {
  const trimmedProjectId = projectId.trim();
  const trimmedBackendId = backendId.trim();

  const deletePreviewBackend = options.deletePreviewBackend === true;
  const trimmedRootDir = rootDir.trim();
  const trimmedBuildCommand = buildCommand.trim();

  if (!deletePreviewBackend && !trimmedRootDir) {
    throw new Error("rootDir is required");
  }

  if (!deletePreviewBackend && !trimmedBuildCommand) {
    throw new Error("buildCommand is required");
  }

  let container = firebaseCliBase().withDirectory(FIREBASE_WORKDIR, source);
  const resolvedNodeAuthToken = maybeResolveNodeAuthToken(
    options.nodeAuthToken,
  );
  const installTarget =
    deletePreviewBackend ? undefined : (
      await resolveInstallTarget(source, trimmedRootDir)
    );

  if (resolvedNodeAuthToken) {
    container = withNpmAuth(container, resolvedNodeAuthToken, {
      workspace: FIREBASE_WORKDIR,
      npmrcPaths: installTarget?.path ?? ".",
      registryScope: options.registryScope ?? DEFAULT_REGISTRY_SCOPE,
    });
  }

  container = withApphostingScripts(container);
  container = withWifAuth(
    container,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    options.wifAudience,
  );

  if (!deletePreviewBackend) {
    container = withInstalledApphostingDependencies(container, installTarget);
    container = withBuildEnv(container, options.buildEnv);
    container = withBuildCommandScript(container, trimmedBuildCommand);
    container = withApphostingBuildPreparation(
      container,
      trimmedBackendId,
      trimmedRootDir,
      options.firebaseDir,
    );
  }

  container = withResolvedApphostingAction(
    container,
    trimmedProjectId,
    trimmedBackendId,
    options,
  );
  return container.stdout();
}

export async function firebaseApplyApphostingTerraform(
  source: Directory,
  projectId: string,
  backendId: string,
  appId: string,
  imageUrl: string,
  buildId: string,
  wifProvider: string,
  wifServiceAccount: string,
  wifOidcToken: Secret,
  options: FirebaseApphostingTerraformOptions = {},
): Promise<string> {
  const terraformDir = options.terraformDir?.trim() || "src/cicd/terraform";
  const region = options.region?.trim() || "asia-southeast1";

  let container = withTerraformCli(
    firebaseNodeBase().withDirectory(FIREBASE_WORKDIR, source),
  );

  container = withWifAuth(
    container,
    wifProvider,
    wifServiceAccount,
    wifOidcToken,
    options.wifAudience,
  );

  container = withExecutableScript(
    container,
    APPHOSTING_TERRAFORM_RUNTIME_PATH,
    loadBundledScript("apply-apphosting-terraform"),
  )
    .withEnvVariable("TF_VAR_project_id", projectId)
    .withEnvVariable("TF_VAR_backend_id", backendId)
    .withEnvVariable("TF_VAR_app_id", appId)
    .withEnvVariable("TF_VAR_image_url", imageUrl)
    .withEnvVariable("TF_VAR_build_id", buildId)
    .withEnvVariable("TF_VAR_region", region)
    .withEnvVariable(
      "TF_VAR_service_account_email",
      options.serviceAccountEmail?.trim() || "",
    );

  if (options.firebaseWebappConfig) {
    container = container.withSecretVariable(
      "TF_VAR_firebase_webapp_config",
      options.firebaseWebappConfig,
    );
  }

  return container
    .withWorkdir(`${FIREBASE_WORKDIR}/${terraformDir}`)
    .withExec(["node", APPHOSTING_TERRAFORM_RUNTIME_PATH])
    .stdout();
}
