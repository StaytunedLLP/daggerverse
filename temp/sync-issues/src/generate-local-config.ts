import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseFrontmatter, parseFlagBlock } from "../lib/parser.js";
import { listMarkdownFiles, getDomainFeatureDirs } from "../lib/effects.js";
import { isSuccess } from "../lib/fp.js";

const SRC_ROOT = process.cwd();

// Uses shared getDomainFeatureDirs from lib/effects.js

// Default to finding domain feature directories, or use DOCS_DIR env var for backward compatibility
const getDocsDirs = (): string[] => {
  if (process.env.DOCS_DIR) {
    return [process.env.DOCS_DIR];
  }
  return getDomainFeatureDirs();
};

const OUTPUT_DIR =
  process.env.OUTPUT_DIR || join(SRC_ROOT, "remote-config/generated");

interface FlagMetadata {
  key: string;
  defaultValue: string | number | boolean | object;
  context: string;
  featureName: string;
  namespace: "client" | "server";
}

// Use shared `listMarkdownFiles` from lib/effects for recursive discovery

const sanitizeValue = (val: string, type: string) => {
  const clean = val.replace(/^`|`$/g, "");
  if (type === "BOOLEAN") return clean.toLowerCase() === "true";
  if (type === "NUMBER") return Number(clean);
  if (type === "JSON") {
    try {
      return JSON.parse(clean);
    } catch {
      return clean;
    }
  }
  return clean.replace(/^"|"$/g, "");
};

const generate = () => {
  console.log("Generating local config files...");

  const docsDirs = getDocsDirs();
  let allFiles: string[] = [];
  for (const dir of docsDirs) {
    const filesRes = listMarkdownFiles(dir);
    if (isSuccess(filesRes)) {
      allFiles = allFiles.concat(filesRes.value);
    }
  }

  const flags: FlagMetadata[] = [];

  for (const file of allFiles) {
    const content = readFileSync(file, "utf8");
    const { data } = parseFrontmatter(content);
    const block = parseFlagBlock(content);

    if (!block) continue;

    for (const flag of block.flags) {
      // Only include anchored keys
      const keyMatch = flag.key.match(
        /feature_fe_\d+_fl_\d+_.+?_(enabled|config|val)/,
      );
      if (!keyMatch) continue;

      const key = keyMatch[0];
      flags.push({
        key,
        defaultValue: sanitizeValue(flag.defaultDev, flag.type),
        context: flag.context,
        featureName: data.feature_name || basename(file, ".md"),
        namespace: flag.namespace,
      });
    }
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Helper to generate TS content
  const generateTS = (namespace: "client" | "server", name: string) => {
    const filtered = flags.filter((f) => f.namespace === namespace);
    const constantLines = filtered.map((f) => {
      const constName = f.context.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return `  /** ${f.featureName} */\n  ${constName}: "${f.key}",`;
    });

    return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * This file contains parameters for Remote Config ${namespace} flags.
 */

export const ${name} = {
${constantLines.join("\n")}
} as const;

export type ${namespace === "client" ? "ClientParameter" : "ServerParameter"} = (typeof ${name})[keyof typeof ${name}];
`;
  };

  // 1. Generate client-parameters.ts
  writeFileSync(
    join(OUTPUT_DIR, "client-parameters.ts"),
    generateTS("client", "CLIENT_PARAMETERS"),
  );
  console.log(`✅ Generated ${join(OUTPUT_DIR, "client-parameters.ts")}`);

  // 2. Generate server-parameters.ts
  writeFileSync(
    join(OUTPUT_DIR, "server-parameters.ts"),
    generateTS("server", "SERVER_PARAMETERS"),
  );
  console.log(`✅ Generated ${join(OUTPUT_DIR, "server-parameters.ts")}`);

  // 3. Keep defaults for local testing if needed (optional based on user request but useful)
  const defaults: Record<string, any> = {};
  for (const f of flags) {
    defaults[f.key] =
      typeof f.defaultValue === "object"
        ? JSON.stringify(f.defaultValue)
        : String(f.defaultValue);
  }
  writeFileSync(
    join(OUTPUT_DIR, "remote-config-defaults.json"),
    JSON.stringify(defaults, null, 2),
  );
};

generate();
