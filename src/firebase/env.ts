import { Container, Secret } from "@dagger.io/dagger";
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

  const frontendWorkdir = `${FIREBASE_WORKDIR}/${options.frontendDir}`;

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
    .withWorkdir(frontendWorkdir)
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

  // Parse webappConfig if provided
  if (options.webappConfig) {
    const rawConfig = await options.webappConfig.plaintext();
    configured = configured.withEnvVariable("VITE_FIREBASE_WEBAPP_CONFIG", rawConfig.trim());
    
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
          configured = configured.withEnvVariable(envKey, value.trim());
        }
      }
    } catch (e) {
      console.warn("Failed to parse webappConfig as JSON in Dagger module");
    }
  }

  // Handle extraEnv
  if (options.extraEnv) {
    const rawExtra = await options.extraEnv.plaintext();
    const lines = rawExtra.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    for (const line of lines) {
      const firstEq = line.indexOf("=");
      if (firstEq !== -1) {
        const key = line.substring(0, firstEq).trim();
        const value = line.substring(firstEq + 1).trim();
        configured = configured.withEnvVariable(key, value);
      }
    }
  }

  // Still write to .env for tools that strictly need it
  return configured.withExec([
    "bash",
    "-lc",
    "env | grep -E '^(VITE_|FIREBASE_|FIRESTORE_|REMOTE_|BUILD_)' > .env",
  ]);
}

