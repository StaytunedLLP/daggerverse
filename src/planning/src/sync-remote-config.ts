/**
 * sync-remote-config.ts
 *
 * Main orchestrator for Remote Config flag synchronization.
 * Refactored to follow functional programming principles.
 */

import { join, basename } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import {
  type Result,
  success,
  failure,
  isSuccess,
  isFailure,
  pipe,
  map,
  flatMap,
} from "../lib/fp.js";
import { type GhError } from "../lib/github.js";
import {
  deriveFlagKey,
  parseFlagKey,
  isValidFlagKey,
} from "../lib/flag-key.js";
import {
  createTemplateFragment,
  mergeTemplates,
  extractFlagKeys,
} from "../lib/template.js";
import { parseFrontmatter, parseFlagBlock } from "../lib/parser.js";
import {
  readFile,
  listMarkdownFiles,
  fileExists,
  getAccessToken,
  fetchTemplate,
  publishTemplate,
  resolveNamespace,
  log,
  getDomainFeatureDirs,
  type EffectError,
} from "../lib/effects.js";
import type {
  CliArgs,
  EnvironmentId,
  ProvisionResult,
  FlagConfig,
  RemoteConfigTemplate,
} from "../lib/types.js";
import { FIREBASE_PROJECTS } from "../lib/types.js";

// ============================================================================
// Configuration
// ============================================================================

const SRC_ROOT = join(process.cwd(), "src");

// Uses shared getDomainFeatureDirs from lib/effects.js

// ============================================================================
// Types
// ============================================================================

type AppError = GhError | EffectError | { _tag: "LogicError"; message: string };

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const args = argv.slice(2);
  const getArg = (name: string): string | null => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split("=")[1] : null;
  };

  // Dynamically select default environment (prefer first dev environment)
  const envIds = Object.keys(FIREBASE_PROJECTS);
  const defaultEnv =
    envIds.find((id) => id.toLowerCase().includes("dev")) || envIds[0] || "dev";

  const env = (getArg("env") ?? defaultEnv) as EnvironmentId;
  const cliDryRun = args.includes("--dry-run");
  const envDryRun = process.env.DRY_RUN === "true";

  return { env, dryRun: cliDryRun || envDryRun };
};

// ============================================================================
// Core Provisioning Logic
// ============================================================================

const getDefaultValueForEnv = (
  flag: FlagConfig,
  env: EnvironmentId,
): string => {
  if (env.includes("dev")) return flag.defaultDev;
  if (env.includes("stg")) return flag.defaultStg;
  return flag.defaultProd;
};

const provisionFlag = (
  featureNumber: number,
  flagNumber: number,
  flag: FlagConfig,
  boundedContext: string,
  description: string,
  accessToken: string,
  targetEnv: EnvironmentId,
  projectId: string,
  dryRun: boolean,
  templateCache: Record<string, RemoteConfigTemplate | null>,
): Result<AppError, ProvisionResult> => {
  const flagKey = deriveFlagKey(
    featureNumber,
    flagNumber,
    flag.context,
    flag.type,
  );
  const firebaseNamespace = resolveNamespace(flag.namespace);
  const defaultValue = getDefaultValueForEnv(flag, targetEnv);

  log.info(`   🔧 Flag: ${flag.context} (Key: ${flagKey})`);

  if (dryRun) {
    log.info(`      [DRY-RUN] Would provision ${flagKey} to ${targetEnv}`);
    return success({ success: true, flagKey, environment: targetEnv });
  }

  const templateRes = templateCache[firebaseNamespace]
    ? success(templateCache[firebaseNamespace]!)
    : fetchTemplate(projectId, firebaseNamespace, accessToken);

  if (isFailure(templateRes))
    return templateRes as Result<AppError, ProvisionResult>;
  const existing = templateRes.value;
  templateCache[firebaseNamespace] = existing;

  if (extractFlagKeys(existing).includes(flagKey)) {
    log.skip(
      `   Flag "${flag.context}" already exists in project ${projectId}`,
    );
    return success({ success: true, flagKey, environment: targetEnv });
  }

  const fragment = createTemplateFragment(
    boundedContext,
    flagKey,
    defaultValue,
    description,
    flag.type,
  );
  const merged = mergeTemplates(existing, fragment);

  return pipe(
    publishTemplate(projectId, merged, firebaseNamespace, accessToken),
    map(() => {
      templateCache[firebaseNamespace] = null;
      return { success: true, flagKey, environment: targetEnv };
    }),
  );
};

// ============================================================================
// Main Application
// ============================================================================

const main = async (): Promise<Result<AppError, void>> => {
  const args = parseCliArgs(process.argv);

  log.info("🔥 Remote Config Sync (TypeScript)");
  log.info(`Target Environment: ${args.env}`);

  const projectId =
    process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECTS[args.env]?.projectId;
  if (!projectId) {
    return failure({
      _tag: "LogicError",
      message: `No project ID found for environment: ${args.env}`,
    } as AppError);
  }

  const featureDirs = getDomainFeatureDirs();
  if (featureDirs.length === 0) {
    log.info("No domain feature directories found. Skipping.");
    return success(undefined);
  }

  const authRes = getAccessToken();
  if (isFailure(authRes)) return authRes as Result<AppError, void>;
  const accessToken = authRes.value;

  // Collect all feature files from all domains
  let allFeatureFiles: string[] = [];
  for (const featuresDir of featureDirs) {
    const filesRes = listMarkdownFiles(featuresDir);
    if (isSuccess(filesRes)) {
      allFeatureFiles = allFeatureFiles.concat(filesRes.value);
    }
  }

  if (allFeatureFiles.length === 0) {
    log.info("No feature files found. Skipping.");
    return success(undefined);
  }

  const templateCache: Record<string, RemoteConfigTemplate | null> = {
    firebase: null,
    "firebase-server": null,
  };

  let provisionedCount = 0;
  let skippedCount = 0;

  for (const filePath of allFeatureFiles) {
    const contentRes = readFile(filePath);
    if (isFailure(contentRes)) continue;

    const { data } = parseFrontmatter(contentRes.value);
    if (!data.issue_number) {
      skippedCount++;
      continue;
    }

    const block = parseFlagBlock(contentRes.value);
    if (!block || block.flags.length === 0) {
      skippedCount++;
      continue;
    }

    log.section(`Processing: ${basename(filePath)}`);

    for (const flag of block.flags) {
      let flagNumber = data.flag_issue_number ?? null;
      if (flag.key && isValidFlagKey(flag.key)) {
        const parsed = parseFlagKey(flag.key);
        if (parsed) flagNumber = parsed.flagNumber;
      }

      if (!flagNumber) continue;

      const res = provisionFlag(
        data.issue_number,
        flagNumber,
        flag,
        data.bounded_context ?? "general",
        data.feature_name ?? `Feature ${data.issue_number}`,
        accessToken,
        args.env,
        projectId,
        args.dryRun,
        templateCache,
      );

      if (isSuccess(res)) {
        if (res.value.success) provisionedCount++;
      } else {
        return res as Result<AppError, void>;
      }
    }
  }

  log.divider();
  log.info(
    `📊 Summary: ${provisionedCount} provisioned, ${skippedCount} skipped`,
  );
  return success(undefined);
};

main()
  .then((res) => {
    if (isFailure(res)) {
      log.error(`Fatal error: ${res.error.message}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
