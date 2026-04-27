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

export function withFrontendEnv(
  container: Container,
  options: FirebaseEnvOptions,
): Container {
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
    configured = configured.withEnvVariable(
      "VITE_FIREBASE_APP_ID",
      options.appId,
    );
  }

  if (options.webappConfig) {
    configured = configured.withSecretVariable(
      "WEBAPP_CONFIG_SECRET",
      options.webappConfig,
    );
  }

  if (options.extraEnv) {
    configured = configured.withSecretVariable(
      "EXTRA_ENV_SECRET",
      options.extraEnv,
    );
  }

  return configured.withExec([
    "bash",
    "-lc",
    [
      STRICT_SHELL_HEADER,
      "node <<'EOF'",
      "const fs = require('node:fs');",
      "",
      "function formatEnvValue(value) {",
      "  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {",
      "    return value;",
      "  }",
      "  return JSON.stringify(value);",
      "}",
      "",
      "function lenientParse(input) {",
      "  const trimmed = input.trim();",
      "  if (!trimmed) return {};",
      "  try {",
      "    return JSON.parse(trimmed);",
      "  } catch {",
      "    const fixed = trimmed",
      "      .replace(/([{,]\\s*)([a-zA-Z0-9_]+)\\s*:/g, '$1\"$2\":')",
      "      .replace(/'/g, '\"')",
      "      .replace(/,\\s*([}\\]])/g, \"$1\");",
      "    return JSON.parse(fixed);",
      "  }",
      "}",
      "",
      "const envPath = '.env';",
      "const existingEnvContent = fs.existsSync(envPath)",
      "  ? fs.readFileSync(envPath, 'utf8')",
      "  : '';",
      "const envEntries = {",
      "  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,",
      "  FIREBASE_ENV: process.env.FIREBASE_ENV,",
      "  FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID,",
      "  REMOTE_CONFIG_TEMPLATE: process.env.REMOTE_CONFIG_TEMPLATE,",
      "  VITE_FUNCTION_BASE_URL: process.env.VITE_FUNCTION_BASE_URL,",
      "  VITE_IAM_GRAPHQL_URL: process.env.VITE_IAM_GRAPHQL_URL,",
      "  BUILD_MODE: process.env.BUILD_MODE,",
      "};",
      "",
      "if (process.env.VITE_FIREBASE_APP_ID) {",
      "  envEntries.VITE_FIREBASE_APP_ID = process.env.VITE_FIREBASE_APP_ID;",
      "}",
      "",
      "if (process.env.WEBAPP_CONFIG_SECRET) {",
      "  envEntries.VITE_FIREBASE_WEBAPP_CONFIG = process.env.WEBAPP_CONFIG_SECRET;",
      "  const parsed = lenientParse(process.env.WEBAPP_CONFIG_SECRET);",
      "  const mapping = [",
      "    ['apiKey', 'VITE_FIREBASE_API_KEY'],",
      "    ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],",
      "    ['projectId', 'VITE_FIREBASE_PROJECT_ID'],",
      "    ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],",
      "    ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],",
      "    ['appId', 'VITE_FIREBASE_APP_ID'],",
      "    ['measurementId', 'VITE_FIREBASE_MEASUREMENT_ID'],",
      "  ];",
      "  for (const [configKey, envKey] of mapping) {",
      "    const value = parsed[configKey];",
      "    if (typeof value === 'string' && value.trim().length > 0) {",
      "      envEntries[envKey] = value;",
      "    }",
      "  }",
      "}",
      "",
      "const lines = [",
      "  existingEnvContent.trimEnd(),",
      "  ...Object.entries(envEntries)",
      "    .filter(([, value]) => typeof value === 'string' && value.length > 0)",
      "    .map(([key, value]) => `${key}=${formatEnvValue(value)}`),",
      "];",
      "",
      "if (process.env.EXTRA_ENV_SECRET && process.env.EXTRA_ENV_SECRET.trim().length > 0) {",
      "  lines.push(process.env.EXTRA_ENV_SECRET.trim());",
      "}",
      "",
      "const filtered = lines.filter(Boolean);",
      "const finalEnvContent = filtered.length > 0 ? `${filtered.join('\\n')}\\n` : '';",
      "fs.writeFileSync(envPath, finalEnvContent);",
      "EOF",
    ]
      .map((line) =>
        line.startsWith("node <<'EOF'") || line === "EOF" ? line : line,
      )
      .join("\n"),
  ]);
}

