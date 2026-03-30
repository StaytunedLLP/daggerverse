/**
 * document.ts
 *
 * Pure functions for processing Epic and Feature documents.
 * Separates computation from I/O - receives content as input, returns structured results.
 */

import { basename, dirname, join } from "node:path";
import type {
    EpicFrontmatter,
    FeatureFrontmatter,
    RenameOperation,
    DocProcessResult
} from "./types.js";
import {
    parseFrontmatter,
    updateFrontmatter,
    extractTitle,
    parseFlagBlock,
    rebuildFlagBlock,
    updateRowWithKey
} from "./parser.js";
import { calculateRenamedPath } from "./rename.js";
import { deriveFlagKey, sanitizeContext, isValidFlagKey, parseFlagKey } from "./flag-key.js";

// ============================================================================
// Document Analysis
// ============================================================================

/**
 * Parse epic frontmatter from content
 */
export const parseEpicFrontmatter = (content: string): EpicFrontmatter => {
    const { data } = parseFrontmatter(content);
    return {
        epic_name: data.feature_name ?? (data as Record<string, unknown>).epic_name as string | undefined,
        issue_url: data.issue_url,
        issue_number: data.issue_number,
        issue_id: (data as Record<string, unknown>).issue_id as string | undefined,
    };
};

/**
 * Parse feature frontmatter from content
 */
export const parseFeatureFrontmatter = (content: string): FeatureFrontmatter => {
    const { data } = parseFrontmatter(content);
    return data;
};

/**
 * Extract document title from content
 */
export const getDocumentTitle = (content: string, fallback: string): string => {
    return extractTitle(content, fallback);
};

/**
 * Get document body (content without frontmatter)
 */
export const getDocumentBody = (content: string): string => {
    const { body } = parseFrontmatter(content);
    return body;
};

// ============================================================================
// Frontmatter Updates
// ============================================================================

/**
 * Update epic frontmatter with issue data
 */
export const updateEpicWithIssue = (
    content: string,
    issueUrl: string,
    issueNumber: number,
    issueId: string
): string => {
    return updateFrontmatter(content, {
        issue_url: issueUrl,
        issue_number: issueNumber,
        issue_id: issueId,
    });
};

/**
 * Update feature frontmatter with issue data
 */
export const updateFeatureWithIssue = (
    content: string,
    issueUrl: string,
    issueNumber: number,
    issueId: string,
    flagIssueNumber?: number
): string => {
    const updates: Record<string, unknown> = {
        issue_url: issueUrl,
        issue_number: issueNumber,
        issue_id: issueId,
    };

    if (flagIssueNumber !== undefined) {
        updates.flag_issue_number = flagIssueNumber;
    }

    return updateFrontmatter(content, updates);
};

/**
 * Update frontmatter with flag issue number
 */
export const updateWithFlagIssue = (
    content: string,
    flagIssueNumber: number
): string => {
    return updateFrontmatter(content, { flag_issue_number: flagIssueNumber });
};

// ============================================================================
// Rename Calculations
// ============================================================================

/**
 * Calculate epic rename based on issue number
 */
export const calculateEpicRename = (
    filePath: string,
    issueNumber: number
): RenameOperation | null => {
    return calculateRenamedPath(filePath, issueNumber, "epic");
};

/**
 * Calculate feature rename based on issue number
 */
export const calculateFeatureRename = (
    filePath: string,
    issueNumber: number
): RenameOperation | null => {
    return calculateRenamedPath(filePath, issueNumber, "feat");
};

// ============================================================================
// Issue Type Detection
// ============================================================================

/**
 * Find the best matching issue type from available types
 */
export const findBestIssueType = (
    availableTypes: readonly string[],
    preferred: string
): string | null => {
    const found = availableTypes.find(t =>
        t.toLowerCase().includes(preferred.toLowerCase())
    );

    if (found) return found;

    // Hardcoded fallbacks if detection fails
    const fallbacks: Record<string, string> = {
        epic: "Epic 🏔️",
        feature: "Feature 🧩",
        flag: "Flag 🚩",
    };

    return fallbacks[preferred.toLowerCase()] ?? null;
};

// ============================================================================
// Flag Key Generation
// ============================================================================

/**
 * Generate flag title from feature and flag issue numbers
 */
export const generateFlagTitle = (
    featureNumber: number,
    flagNumber: number,
    context: string,
    valueType: string = "BOOLEAN"
): string => {
    return deriveFlagKey(featureNumber, flagNumber, context, valueType);
};

/**
 * Generate placeholder flag title (before we know the flag issue number)
 */
export const generatePlaceholderFlagTitle = (
    featureNumber: number,
    context: string,
    valueType: string = "BOOLEAN"
): string => {
    const type = valueType.toUpperCase();
    let suffix = "val";
    if (type === "BOOLEAN") {
        suffix = "enabled";
    } else if (type === "JSON") {
        suffix = "config";
    }
    const sanitizedContext = sanitizeContext(context) || "default";

    return `feature_fe_${featureNumber}_fl_PLACEHOLDER_${sanitizedContext}_${suffix}`;
};

/**
 * Generate flag body content
 */
export const generateFlagBody = (
    featureNumber: number,
    context: string
): string => {
    return `Feature flag for feature #${featureNumber}.

This flag controls the rollout of the feature.

**Context**: ${context}`;
};

/**
 * Anchor flag keys in markdown content.
 * Updates REMOTE_CONFIG_FLAG block and frontmatter.
 */
export const anchorFlagKeysInContent = (
    content: string,
    featureNumber: number,
    flagInput: number | Record<string, number>
): string => {
    // Parse the existing flag block
    const blockResult = parseFlagBlock(content);
    if (!blockResult || blockResult.flags.length === 0) {
        return content;
    }

    const flagKeys: string[] = [];
    const newRows: string[] = [];

    // Update each row with generated key
    for (let i = 0; i < blockResult.rows.length; i++) {
        const row = blockResult.rows[i];
        const flag = blockResult.flags[i];

        if (!flag) {
            newRows.push(row);
            continue;
        }

        // Determine flag number for this specific flag
        let flagNumber: number;
        if (typeof flagInput === "number") {
            flagNumber = flagInput;
        } else {
            flagNumber = flagInput[flag.context];
            if (!flagNumber) {
                // If we have a map but no entry for this context,
                // check if we already have a valid key. If so, keep it.
                // If not, we might be in trouble, but let's try to preserve the row.
                if (flag.key && isValidFlagKey(flag.key)) {
                    // Extract flag number from existing key
                    const parsed = parseFlagKey(flag.key);
                    if (parsed) {
                        flagNumber = parsed.flagNumber;
                    } else {
                        // Fallback/Skip
                        newRows.push(row);
                        continue;
                    }
                } else {
                    // No issue number available for this context
                    newRows.push(row);
                    continue;
                }
            }
        }

        // Skip if already has a real key (not PENDING and not a placeholder)
        // AND the key matches the computed flag number?
        // Actually, if we are passed a new flag number, we should probably enforce it,
        // unless it's the SAME flag number.
        const isPlaceholder = !flag.key || flag.key === "PENDING" || flag.key.includes("auto-generated") || flag.key.includes("PLACEHOLDER");

        if (flag.key && !isPlaceholder && isValidFlagKey(flag.key)) {
            // If valid key already exists, check if we need to update it (e.g. if issue number changed?)
            // For safety, if we explicitly passed a flag number, we likely want to enforce it.
            // But usually this function is called to "fill in" missing keys.
            // Let's rely on standard re-generation to be safe.
        }

        const flagKey = deriveFlagKey(featureNumber, flagNumber, flag.context, flag.type);
        flagKeys.push(flagKey);
        newRows.push(updateRowWithKey(row, flagKey));
    }

    // Rebuild the block
    const newBlock = rebuildFlagBlock(blockResult.header, blockResult.separator, newRows);

    // Replace block in content
    let updatedContent = content.replace(blockResult.original, newBlock);

    // Update frontmatter with first flag_key if not already present
    // We only update if we have generated keys.
    if (flagKeys.length > 0) {
        const { data } = parseFrontmatter(updatedContent);
        if (!data.flag_key) {
            // We prioritize the first key generated
            updatedContent = updateFrontmatter(updatedContent, { flag_key: flagKeys[0] });
        }
    }

    return updatedContent;
};

// ============================================================================
// Document Classification
// ============================================================================

/**
 * Check if a file is an epic document
 */
export const isEpicDocument = (filePath: string): boolean => {
    return filePath.includes("/epics/") && filePath.endsWith(".md");
};

/**
 * Check if a file is a feature document
 */
export const isFeatureDocument = (filePath: string): boolean => {
    return filePath.includes("/features/") && filePath.endsWith(".md");
};

/**
 * Get document type from path
 */
export const getDocumentType = (filePath: string): "Epic" | "Feature" | null => {
    if (isEpicDocument(filePath)) return "Epic";
    if (isFeatureDocument(filePath)) return "Feature";
    return null;
};
