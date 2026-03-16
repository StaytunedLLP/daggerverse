import {
  Directory,
  Secret,
  argument,
  check,
  func,
  object,
} from "@dagger.io/dagger";
import { runNodeChecks } from "./checks/node-checks.js";
import { prepareNodeWorkspace } from "./copilot/prepare-node-workspace.js";
import {
  firebaseApplyApphostingTerraform,
  firebaseDeployApphostingPipeline,
} from "./firebase/apphosting.js";
import { firebaseDeployWebhostingPipeline } from "./firebase/pipeline.js";
import { DEFAULT_SOURCE_EXCLUDES } from "./shared/constants.js";

type CheckMode = "format" | "lint" | "build" | "test";

function requireSource(source?: Directory): Directory {
  if (!source) {
    throw new Error("source is required");
  }

  return source;
}

/**
 * Shared Dagger module for Node/TypeScript repository checks and deployment helpers.
 */
@object()
export class StaydevopsTs {
  private async runDefaultCheck(
    source: Directory | undefined,
    mode: CheckMode,
  ): Promise<void> {
    await runNodeChecks(requireSource(source), undefined, {
      [mode]: true,
    });
  }

  /**
   * Run the repository formatting check with `npm run format:check`.
   *
   * @param source - Repository source directory to validate.
   *
   * @example
   * dagger call format --source .
   */
  @check()
  @func()
  async format(
    @argument({ defaultPath: ".", ignore: [".git", "dagger", "dist", "node_modules"] })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "format");
  }

  /**
   * Run the repository linter with `npm run lint`.
   *
   * @param source - Repository source directory to lint.
   *
   * @example
   * dagger call lint --source .
   */
  @check()
  @func()
  async lint(
    @argument({ defaultPath: ".", ignore: [".git", "dagger", "dist", "node_modules"] })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "lint");
  }

  /**
   * Run the repository build with `npm run build`.
   *
   * @param source - Repository source directory to build.
   *
   * @example
   * dagger call build --source .
   */
  @check()
  @func()
  async build(
    @argument({ defaultPath: ".", ignore: [".git", "dagger", "dist", "node_modules"] })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "build");
  }

  /**
   * Run the repository test suite with `npm run test`.
   *
   * @param source - Repository source directory to test.
   *
   * @example
   * dagger call test --source .
   */
  @check()
  @func()
  async test(
    @argument({ defaultPath: ".", ignore: [".git", "dagger", "dist", "node_modules"] })
    source?: Directory,
  ): Promise<void> {
    await this.runDefaultCheck(source, "test");
  }

  /**
   * Validate that `chromium-bidi` is installed in the selected package path.
   *
   * @param source - Repository source directory that contains the package to inspect.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root. The first path is used for the chromium-bidi check.
   *
   * @example
   * dagger call verify-chromium-bidi --source . --package-paths "./apps/web"
   */
  @func()
  async verifyChromiumBidi(
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
  ): Promise<string> {
    return runNodeChecks(source, nodeAuthToken, {
      packagePaths,
      verifyChromiumBidi: true,
    });
  }

  /**
   * Install Node dependencies and optionally provision Playwright and Firebase tooling.
   *
   * @param source - Repository source directory to install into the workspace container.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when installing private npm packages.
   * @param packagePaths - Package path or comma-separated package paths relative to the source root where npm installs should run.
   * @param playwrightInstall - When true, installs Playwright system dependencies and Chromium into the prepared workspace.
   * @param firebaseTools - When true, installs Firebase CLI tooling in the prepared workspace container.
   *
   * @example
   * dagger call prepare-node-workspace --source . --playwright-install
   */
  @func()
  async prepareNodeWorkspace(
    source: Directory,
    nodeAuthToken?: Secret,
    packagePaths = ".",
    playwrightInstall = false,
    firebaseTools = false,
  ): Promise<Directory> {
    return prepareNodeWorkspace(source, nodeAuthToken, {
      packagePaths,
      playwrightInstall,
      firebaseTools,
    });
  }

  /**
   * Build and deploy a Firebase web hosting project from the provided source tree.
   *
   * @param source - Repository source directory containing the Firebase project and any frontend or backend packages.
   * @param projectId - Firebase project ID used for the deploy command and frontend environment generation.
   * @param gcpCredentials - GCP service account JSON secret used for Firebase deployment authentication.
   * @param appId - Optional Firebase app ID to inject into frontend environment variables before building.
   * @param only - Optional Firebase deploy target selector passed to `firebase deploy --only`.
   * @param frontendDir - Optional frontend package directory to build before deployment, relative to the source root.
   * @param backendDir - Optional backend or secondary package directory whose dependencies should be installed before deployment.
   * @param firebaseDir - Optional directory containing `firebase.json`. Defaults to the workspace root.
   * @param webappConfig - Optional secret containing Firebase web app config JSON to write into frontend environment variables.
   * @param extraEnv - Optional secret containing extra `.env` lines appended before the frontend build runs.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when frontend or backend installs private npm packages.
   *
   * @example
   * dagger call deploy-webhosting --source . --project-id "my-firebase-project" --gcp-credentials env:GCP_CREDENTIALS
   */
  @func({ cache: "never" })
  async deployWebhosting(
    source: Directory,
    projectId: string,
    gcpCredentials: Secret,
    appId?: string,
    only?: string,
    frontendDir?: string,
    backendDir?: string,
    firebaseDir?: string,
    webappConfig?: Secret,
    extraEnv?: Secret,
    nodeAuthToken?: Secret,
  ): Promise<string> {
    return firebaseDeployWebhostingPipeline(source, projectId, gcpCredentials, {
      appId,
      frontendDir,
      backendDir,
      firebaseDir,
      only,
      webappConfig,
      extraEnv,
      nodeAuthToken,
    });
  }

  /**
   * Build and deploy a Firebase App Hosting backend from the provided source tree.
   *
   * Authentication is modeled on the same WIF setup used by the reference GitHub workflows.
   * The caller provides `wifProvider`, `wifServiceAccount`, and an OIDC token secret,
   * and the module generates the external account credentials inside the container.
   *
   * The function returns a JSON string with fields such as `action`, `backendId`,
   * `projectId`, `serviceUrl`, `backendExisted`, and `message`.
   *
   * @param source - Repository source directory containing the app source and any package manifests needed for installation.
   * @param projectId - Firebase project ID that owns the App Hosting backend.
   * @param backendId - Firebase App Hosting backend ID to deploy or delete.
   * @param rootDir - App root directory relative to the source root.
   * @param buildCommand - Shell build command executed from the source root before deployment.
   * @param wifProvider - Workload Identity Provider resource name, for example `projects/123/locations/global/workloadIdentityPools/pool/providers/provider`.
   * @param wifServiceAccount - Service account email used for workload identity impersonation.
   * @param wifOidcToken - OIDC token secret supplied by the caller for the federated exchange.
   * @param firebaseDir - Optional directory containing Firebase deployment context, relative to the source root.
   * @param buildEnv - Optional secret containing `.env` lines to write at the source root before the build runs.
   * @param nodeAuthToken - Optional GitHub Packages token secret. Required only when dependency installation needs private npm access.
   * @param registryScope - Optional npm registry scope for GitHub Packages authentication.
   * @param skipDeploy - When true, run install/build/config generation but skip deploy and return a skipped action.
   * @param allowMissingBackend - When true, do not fail if the backend is missing before deploy.
   * @param createPreviewBackend - When true, create the backend with Firebase CLI before deploy if it does not yet exist. Requires `appId`.
   * @param deletePreviewBackend - When true, delete the backend if present and skip build deployment logic.
   * @param appId - Optional Firebase Web App ID used when backend creation is enabled.
   * @param region - Optional App Hosting region. Defaults to `asia-southeast1`.
   * @param wifAudience - Optional custom WIF audience. Defaults to `//iam.googleapis.com/{wifProvider}`.
   *
   * @example
   * dagger call deploy-apphosting --source . --project-id "my-firebase-project" --backend-id "dev-web" --root-dir "apps/web" --build-command "npm run build --workspace apps/web" --wif-provider "projects/123/locations/global/workloadIdentityPools/pool/providers/provider" --wif-service-account "deploy@project.iam.gserviceaccount.com" --wif-oidc-token env:GITHUB_OIDC_TOKEN
   */
  @func({ cache: "never" })
  async deployApphosting(
    source: Directory,
    projectId: string,
    backendId: string,
    rootDir: string,
    buildCommand: string,
    wifProvider: string,
    wifServiceAccount: string,
    wifOidcToken: Secret,
    firebaseDir?: string,
    buildEnv?: Secret,
    nodeAuthToken?: Secret,
    registryScope?: string,
    skipDeploy = false,
    allowMissingBackend = false,
    createPreviewBackend = false,
    deletePreviewBackend = false,
    appId?: string,
    region?: string,
    wifAudience?: string,
  ): Promise<string> {
    return firebaseDeployApphostingPipeline(
      source,
      projectId,
      backendId,
      rootDir,
      buildCommand,
      wifProvider,
      wifServiceAccount,
      wifOidcToken,
      {
        firebaseDir,
        buildEnv,
        nodeAuthToken,
        registryScope,
        skipDeploy,
        allowMissingBackend,
        createPreviewBackend,
        deletePreviewBackend,
        appId,
        region,
        wifAudience,
      },
    );
  }

  /**
   * Apply the App Hosting Terraform module shipped with the reference workflow package.
   *
   * This is the infrastructure companion to `deployApphosting` for repositories that manage
   * backend/build/traffic resources through Terraform instead of relying only on Firebase CLI.
   *
   * The function returns `terraform output -json`.
   *
   * @param source - Repository source directory containing the Terraform module.
   * @param projectId - Firebase project ID.
   * @param backendId - App Hosting backend ID.
   * @param appId - Firebase Web App ID linked to the backend.
   * @param imageUrl - Container image URL consumed by the Terraform build resource.
   * @param buildId - Build identifier passed to Terraform.
   * @param wifProvider - Workload Identity Provider resource name.
   * @param wifServiceAccount - Service account email used for workload identity impersonation.
   * @param wifOidcToken - OIDC token secret supplied by the caller for the federated exchange.
   * @param terraformDir - Optional Terraform directory relative to the source root. Defaults to `src/cicd/terraform`.
   * @param region - Optional App Hosting region. Defaults to `asia-southeast1`.
   * @param serviceAccountEmail - Optional runtime service account email override.
   * @param firebaseWebappConfig - Optional Firebase web app config JSON secret forwarded to Terraform.
   * @param wifAudience - Optional custom WIF audience. Defaults to `//iam.googleapis.com/{wifProvider}`.
   *
   * @example
   * dagger call apply-apphosting-terraform --source . --project-id "my-firebase-project" --backend-id "prod-web" --app-id "1:123:web:abc" --image-url "asia-southeast1-docker.pkg.dev/my-project/web/prod:sha" --build-id "prod-20260316-1" --wif-provider "projects/123/locations/global/workloadIdentityPools/pool/providers/provider" --wif-service-account "deploy@project.iam.gserviceaccount.com" --wif-oidc-token env:GITHUB_OIDC_TOKEN
   */
  @func({ cache: "never" })
  async applyApphostingTerraform(
    source: Directory,
    projectId: string,
    backendId: string,
    appId: string,
    imageUrl: string,
    buildId: string,
    wifProvider: string,
    wifServiceAccount: string,
    wifOidcToken: Secret,
    terraformDir?: string,
    region?: string,
    serviceAccountEmail?: string,
    firebaseWebappConfig?: Secret,
    wifAudience?: string,
  ): Promise<string> {
    return firebaseApplyApphostingTerraform(
      source,
      projectId,
      backendId,
      appId,
      imageUrl,
      buildId,
      wifProvider,
      wifServiceAccount,
      wifOidcToken,
      {
        terraformDir,
        region,
        serviceAccountEmail,
        firebaseWebappConfig,
        wifAudience,
      },
    );
  }
}
