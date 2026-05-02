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
  envFileName?: string;
};

export function withFrontendEnv(
  container: Container,
  options: FirebaseEnvOptions,
): Container {
  if (!options.frontendDir) {
    return container;
  }

  const frontendWorkdir = `${FIREBASE_WORKDIR}/${options.frontendDir}`;
  const envFileName = options.envFileName?.trim() || ".env";
  let configured = container
    .withWorkdir(frontendWorkdir)
    .withEnvVariable("VITE_FIREBASE_PROJECT_ID", options.projectId);

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
      `ENV_FILE_NAME=${shellQuote(envFileName)} node <<'EOF'`,
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
      "      .replace(/,\\s*([}\\]])/g, '$1');",
      "    return JSON.parse(fixed);",
      "  }",
      "}",
      "",
      "const envPath = process.env.ENV_FILE_NAME || '.env';",
      "const existingEnvContent = fs.existsSync(envPath)",
      "  ? fs.readFileSync(envPath, 'utf8')",
      "  : '';",
      "const envEntries = {",
      "  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,",
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
