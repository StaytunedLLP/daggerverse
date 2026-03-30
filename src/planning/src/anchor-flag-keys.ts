/**
 * anchor-flag-keys.ts
 *
 * Updates feature documentation with generated flag keys.
 * Preserves REMOTE_CONFIG_FLAG block structure, updates Key column.
 *
 * Refactored to follow functional programming principles.
 */

import { join } from "node:path";
import { anchorFlagKeysInContent } from "../lib/document.js";
import { parseFrontmatter, parseFlagBlock } from "../lib/parser.js";
import {
  readFile,
  writeFile,
  listMarkdownFiles,
  fileExists,
  log,
  getDomainFeatureDirs,
} from "../lib/effects.js";
import { isSuccess, isFailure } from "../lib/fp.js";

// ============================================================================
// Configuration
// ============================================================================

const SRC_ROOT = join(process.cwd(), "src");

// Uses shared getDomainFeatureDirs from lib/effects.js

// ============================================================================
// Main Logic
// ============================================================================

const main = async (): Promise<void> => {
  log.info("⚓ Anchoring Flag Keys to Documentation");
  log.divider();

  const featureDirs = getDomainFeatureDirs();

  if (featureDirs.length === 0) {
    log.info("No domain feature directories found. Skipping.");
    return;
  }

  let allFiles: string[] = [];
  for (const featuresDir of featureDirs) {
    const filesRes = listMarkdownFiles(featuresDir);
    if (isSuccess(filesRes)) {
      allFiles = allFiles.concat(filesRes.value);
    }
  }

  if (allFiles.length === 0) {
    log.info("No feature files found. Skipping.");
    return;
  }

  let updated = 0;

  for (const filePath of allFiles) {
    const contentRes = readFile(filePath);
    if (isFailure(contentRes)) continue;
    const content = contentRes.value;

    const { data } = parseFrontmatter(content);

    // Skip if no flag issue number or feature number
    if (!data.flag_issue_number || !data.issue_number) {
      continue;
    }

    // Skip if already has flag_key in frontmatter
    if (data.flag_key) {
      continue;
    }

    // Check if there is even a flag block to update
    const blockResult = parseFlagBlock(content);
    if (!blockResult || blockResult.flags.length === 0) {
      continue;
    }

    const featureNumber = data.issue_number;
    const flagNumber = data.flag_issue_number;

    const updatedContent = anchorFlagKeysInContent(
      content,
      featureNumber,
      flagNumber,
    );

    if (updatedContent !== content) {
      writeFile(filePath, updatedContent);
      log.info(`📝 ${filePath.split("/").pop()}: Updated with flag keys`);
      updated++;
    }
  }

  log.divider();
  log.info(`📊 Anchored ${updated} documents with flag keys`);
};

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
