import { dag, Container, Directory, object, func, Secret } from "@dagger.io/dagger";

const FIREBASE_WORKDIR = "/src";
const FIREBASE_WIF_OIDC_TOKEN_PATH = "/tmp/oidc-token";
const FIREBASE_WIF_CREDENTIALS_PATH = "/tmp/google-credentials.json";
const FIREBASE_GCP_CREDENTIALS_PATH = "/tmp/gcp-credentials.json";

@object()
export class DaggerDeploy {
  /**
   * Returns a base container with firebase-tools installed and cached.
   */
  @func()
  base(): Container {
    const npmCache = dag.cacheVolume("dagger-deploy-npm-cache");
    return dag
      .container()
      .from("node:24-alpine")
      .withMountedCache("/root/.npm", npmCache)
      .withExec(["apk", "add", "--no-cache", "bash", "curl", "git"])
      .withExec(["npm", "install", "-g", "firebase-tools"]);
  }

  /**
   * Deploys the application to Firebase App Hosting using source-based deployment.
   */
  @func()
  async deployApphosting(
    source: Directory,
    projectId: string,
    backendId: string,
    rootDir: string = ".",
    appId: string = "",
    region: string = "asia-southeast1",
    gcpCredentials?: Secret,
    wifProvider: string = "",
    wifServiceAccount: string = "",
    wifOidcToken?: Secret,
    wifAudience: string = "",
  ): Promise<string> {
    
    // 1. Start with the cached base container
    let container = this.base(); 

    // 2. Setup Google Cloud Auth
    if (gcpCredentials) {
      container = container
        .withMountedSecret(FIREBASE_GCP_CREDENTIALS_PATH, gcpCredentials)
        .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", FIREBASE_GCP_CREDENTIALS_PATH)
        .withEnvVariable("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", FIREBASE_GCP_CREDENTIALS_PATH)
        .withoutEnvVariable("FIREBASE_TOKEN");
    } else if (wifProvider && wifServiceAccount && wifOidcToken) {
      const resolvedAudience = wifAudience.trim() || `https://iam.googleapis.com/${wifProvider.trim()}`;
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
        2
      );

      container = container
        .withMountedSecret(FIREBASE_WIF_OIDC_TOKEN_PATH, wifOidcToken)
        .withNewFile(FIREBASE_WIF_CREDENTIALS_PATH, `${credentialsPayload}\n`)
        .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", FIREBASE_WIF_CREDENTIALS_PATH)
        .withEnvVariable("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", FIREBASE_WIF_CREDENTIALS_PATH)
        .withoutEnvVariable("FIREBASE_TOKEN");
    } else {
      throw new Error("Either gcpCredentials or (wifProvider, wifServiceAccount, wifOidcToken) must be provided.");
    }

    // 3. Prepare firebase.json for apphosting
    const firebaseConfig = {
      apphosting: {
        backendId: backendId,
        rootDir: rootDir,
      },
    };

    // 4. Mount the source code and inject firebase.json
    container = container
      .withDirectory("/workspace", source)
      .withWorkdir("/workspace")
      .withNewFile("/workspace/firebase.json", JSON.stringify(firebaseConfig, null, 2));

    // 5. Ensure Backend Exists (Check then Create if missing)
    const setupBackendCmd = [
      "bash",
      "-c",
      `if firebase apphosting:backends:list --project ${projectId} | grep -q "\\b${backendId}\\b"; then ` +
      `  echo "Backend ${backendId} already exists."; ` +
      `else ` +
      `  echo "Backend ${backendId} not found, attempting to create in ${region}..."; ` +
      `  firebase apphosting:backends:create --backend ${backendId} --project ${projectId} --primary-region ${region} ${appId ? `--app ${appId}` : ""} --non-interactive; ` +
      `fi`
    ];

    container = container.withExec(setupBackendCmd);

    // 6. Execute Deployment Command (Source-based)
    const deployCmd = [
      "firebase",
      "deploy",
      "--only",
      `apphosting:${backendId}`,
      "--project",
      projectId,
      "--non-interactive",
      "--force"
    ];

    container = container.withExec(deployCmd);

    // 7. Get Service URL
    const getCmd = [
      "firebase",
      "apphosting:backends:get",
      backendId,
      "--project",
      projectId,
      "--json",
    ];

    const backendJson = await container.withExec(getCmd).stdout();
    try {
      const backend = JSON.parse(backendJson);
      // Handle both direct and result-wrapped JSON structures
      const result = backend.result || backend;
      return result.uri || "URL not found";
    } catch {
      return "Failed to parse backend info";
    }
  }

  /**
   * Deletes a Firebase App Hosting backend.
   */
  @func()
  async deleteBackend(
    projectId: string,
    backendId: string,
    gcpCredentials?: Secret,
  ): Promise<string> {
    let container = this.base();

    if (gcpCredentials) {
      container = container
        .withMountedSecret(FIREBASE_GCP_CREDENTIALS_PATH, gcpCredentials)
        .withEnvVariable("GOOGLE_APPLICATION_CREDENTIALS", FIREBASE_GCP_CREDENTIALS_PATH);
    }

    const deleteCmd = [
      "firebase",
      "apphosting:backends:delete",
      backendId,
      "--project",
      projectId,
      "--force",
      "--non-interactive",
    ];

    return container.withExec(deleteCmd).stdout();
  }
}
