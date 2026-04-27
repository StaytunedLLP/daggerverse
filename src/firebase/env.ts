import { Container, Secret, dag } from "@dagger.io/dagger";
import { STRICT_SHELL_HEADER } from "../shared/constants.js";
import { shellQuote } from "../shared/path-utils.js";
import { FIREBASE_WORKDIR } from "./constants.js";

export type FirebaseEnvOptions = {
  frontendDir?: string;
  projectId: string;
  appId?: string;
  webappConfig?: Secret;
  extraEnv?: Secret;
  targetEnv?: string;
  firebaseEnv?: string;
  firestoreDatabaseId?: string;
  functionsRegion?: string;
};

export async function withFrontendEnv(
  container: Container,
  options: FirebaseEnvOptions,
): Promise<Container> {
  if (!options.frontendDir) {
    return container;
  }

  // Derive environment values as per the reference YAML logic
  const envPrefix = options.targetEnv?.split("-")[0] || "dev";
  const firebaseEnv =
    options.firebaseEnv ||
    (["dev", "stg", "prod"].includes(envPrefix) ? envPrefix : "dev");
  const firestoreDatabaseId = options.firestoreDatabaseId || `${envPrefix}-db`;
  const functionsRegion = options.functionsRegion || "asia-south1";

  let buildMode = "production";
  if (options.targetEnv?.startsWith("dev")) buildMode = "development";
  else if (options.targetEnv?.startsWith("stg") || options.targetEnv?.startsWith("staging"))
    buildMode = "staging";

  let remoteConfigTemplate = "";
  switch (firebaseEnv) {
    case "dev":
      remoteConfigTemplate = "isDevEnv=true;isStgEnv=false;isProdEnv=false";
      break;
    case "stg":
      remoteConfigTemplate = "isDevEnv=false;isStgEnv=true;isProdEnv=false";
      break;
    case "prod":
      remoteConfigTemplate = "isDevEnv=false;isStgEnv=false;isProdEnv=true";
      break;
  }

  const functionBaseUrl = `https://${functionsRegion}-${options.projectId}.cloudfunctions.net`;
  const iamGraphqlUrl = `${functionBaseUrl}/iam_graphql`;

  let configured = container
    .withEnvVariable("VITE_FIREBASE_PROJECT_ID", options.projectId)
    .withEnvVariable("FIREBASE_ENV", firebaseEnv)
    .withEnvVariable("FIRESTORE_DATABASE_ID", firestoreDatabaseId)
    .withEnvVariable("REMOTE_CONFIG_TEMPLATE", remoteConfigTemplate)
    .withEnvVariable("VITE_FUNCTION_BASE_URL", functionBaseUrl)
    .withEnvVariable("VITE_IAM_GRAPHQL_URL", iamGraphqlUrl)
    .withEnvVariable("BUILD_MODE", buildMode);

  if (options.appId) {
    configured = configured.withEnvVariable("VITE_FIREBASE_APP_ID", options.appId);
  }

  // Inject Webapp Config
  if (options.webappConfig) {
    // We parse it in TypeScript to extract mapped keys
    const rawConfig = await options.webappConfig.plaintext();
    try {
      const trimmed = rawConfig.trim();
      let parsed: any;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        const fixed = trimmed
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
          .replace(/,\s*([}\]])/g, "$1");
        parsed = JSON.parse(fixed);
      }

      const mapping: Record<string, string> = {
        apiKey: "VITE_FIREBASE_API_KEY",
        authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
        projectId: "VITE_FIREBASE_PROJECT_ID",
        storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
        messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
        appId: "VITE_FIREBASE_APP_ID",
        measurementId: "VITE_FIREBASE_MEASUREMENT_ID",
      };

      for (const [configKey, envKey] of Object.entries(mapping)) {
        const value = parsed[configKey];
        if (typeof value === "string" && value.trim().length > 0) {
          // Convert the string to a Dagger Secret to MASK it in logs
          const secret = dag.setSecret(envKey, value.trim());
          configured = configured.withSecretVariable(envKey, secret);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  if (options.extraEnv) {
    configured = configured.withSecretVariable("EXTRA_ENV_SECRET", options.extraEnv);
  }

  // Write .env in the CURRENT directory (staying in caller's context like /workspace)
  // Note: Dagger will mask the secret values in the logs even during this bash script
  return configured.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      "env | grep -E '^(VITE_|FIREBASE_|FIRESTORE_|REMOTE_|BUILD_)' > .env",
      "if [ -n \"${EXTRA_ENV_SECRET:-}\" ]; then echo \"$EXTRA_ENV_SECRET\" >> .env; fi",
    ].join("\n"),
  ]);
}

