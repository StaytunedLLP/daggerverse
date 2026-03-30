#!/usr/bin/env node
/**
 * sync-planning.ts
 *
 * Main orchestrator for the Planning Lifecycle Sync workflow.
 * Refactored to follow functional programming principles.
 */

import { basename, join } from "node:path";
import { renameSync, existsSync, readdirSync } from "node:fs";

// Functional Primitives
import { type Result, success, failure, isSuccess, isFailure, pipe, map, flatMap } from "../lib/fp.js";
import { readFile, writeFile, listMarkdownFiles, log, renameFile, type EffectError } from "../lib/effects.js";
import { type GhError } from "../lib/github.js";
import * as github from "../lib/github.js";
import * as git from "../lib/git.js";

// Library imports
import type { RepoInfo, RenameOperation, DocProcessResult } from "../lib/types.js";
import { updateLinksInContent, filterPendingRenames } from "../lib/rename.js";
import { parseFlagBlock } from "../lib/parser.js";
import { parseFlagKey, isValidFlagKey } from "../lib/flag-key.js";
import {
    parseEpicFrontmatter,
    parseFeatureFrontmatter,
    getDocumentTitle,
    getDocumentBody,
    updateEpicWithIssue,
    updateFeatureWithIssue,
    updateWithFlagIssue,
    calculateEpicRename,
    calculateFeatureRename,
    findBestIssueType,
    generateFlagTitle,
    generatePlaceholderFlagTitle,
    generateFlagBody,
    anchorFlagKeysInContent,
} from "../lib/document.js";

// ============================================================================
// Configuration
// ============================================================================

const SRC_ROOT = join(process.cwd(), "src");
const GLOBAL_REQUIREMENT_DIR = join(SRC_ROOT, "requirement");

// Helper to find all domain requirement directories
const getDomainRequirementDirs = (): string[] => {
    if (!existsSync(SRC_ROOT)) return [];

    const entries = readdirSync(SRC_ROOT, { withFileTypes: true });
    const domainDirs: string[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const reqDir = join(SRC_ROOT, entry.name, "requirement");
            if (existsSync(reqDir)) {
                domainDirs.push(reqDir);
            }
        }
    }

    // Also check for top-level src/requirement
    if (existsSync(GLOBAL_REQUIREMENT_DIR) && !domainDirs.includes(GLOBAL_REQUIREMENT_DIR)) {
        domainDirs.push(GLOBAL_REQUIREMENT_DIR);
    }

    return domainDirs;
};

// Extract domain name from file path (e.g., src/itsme.fashion/requirement/... -> itsme.fashion)
const extractDomainFromPath = (filePath: string): string | null => {
    const srcMatch = filePath.match(/src\/([^/]+)\/requirement\//);
    if (srcMatch && srcMatch[1] !== "requirement") {
        return srcMatch[1];
    }
    return null;
};

// ============================================================================
// Types
// ============================================================================

type AppError = GhError | EffectError | { _tag: "LogicError"; message: string };

interface CliOptions {
    readonly dryRun: boolean;
    readonly validate: boolean;
    readonly repo: string | undefined;
}

// ============================================================================
// CLI Parsing
// ============================================================================

const parseArgs = (args: string[]): CliOptions => ({
    dryRun: args.includes("--dry-run"),
    validate: args.includes("--validate"),
    repo: args.indexOf("--repo") !== -1 ? args[args.indexOf("--repo") + 1] : undefined,
});

// ============================================================================
// Processing Logic
// ============================================================================

const processEpic = (
    filePath: string,
    repoInfo: RepoInfo,
    epicType: string | null,
    dryRun: boolean
): Result<AppError, DocProcessResult> => {
    const fileName = basename(filePath);
    const domain = extractDomainFromPath(filePath);

    return pipe(
        readFile(filePath),
        flatMap((content: string): Result<AppError, DocProcessResult> => {
            const fm = parseEpicFrontmatter(content);
            let issueUrl = fm.issue_url ?? null;
            let issueNumber = fm.issue_number ?? null;
            let issueId = fm.issue_id ?? null;

            if (!issueUrl) {
                log.info(`Creating Epic issue for ${fileName}...`);
                const title = fm.epic_name || getDocumentTitle(content, fileName.replace(".md", ""));
                const body = getDocumentBody(content);

                const createdRes = github.createIssue({
                    owner: repoInfo.owner,
                    repo: repoInfo.repo,
                    title,
                    body,
                }, dryRun);

                if (isFailure(createdRes)) return createdRes as Result<AppError, DocProcessResult>;
                const created = createdRes.value;

                issueUrl = created.url;
                issueNumber = created.number;
                issueId = created.nodeId;

                if (epicType) {
                    const typeRes = github.setIssueType(repoInfo.owner, repoInfo.repo, created.number, epicType, dryRun);
                    if (isFailure(typeRes)) log.warn(`Failed to set issue type for #${created.number}`);
                }

                // Add domain label for domain-specific epics
                if (domain && issueNumber !== null) {
                    log.info(`Adding domain label '${domain}' to epic #${issueNumber}...`);
                    github.addLabels(repoInfo.owner, repoInfo.repo, issueNumber, [domain], dryRun);
                }

                const updatedContent = updateEpicWithIssue(content, issueUrl, issueNumber, issueId);
                const writeRes = writeFile(filePath, updatedContent);
                if (isFailure(writeRes)) return writeRes as Result<AppError, DocProcessResult>;
            }

            const renamed = issueNumber !== null ? calculateEpicRename(filePath, issueNumber) : null;

            return success({
                type: "Epic",
                id: issueId,
                number: issueNumber,
                url: issueUrl,
                renamed,
            });
        })
    );
};

const createFlagForFeature = (
    repoInfo: RepoInfo,
    featureNumber: number,
    featureId: string,
    context: string,
    flagType: string,
    dryRun: boolean
): Result<AppError, number> => {
    log.info(`Creating Flag sub-issue for feature #${featureNumber}...`);

    const placeholderTitle = generatePlaceholderFlagTitle(featureNumber, context);
    const body = generateFlagBody(featureNumber, context);

    return pipe(
        github.createIssue({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            title: placeholderTitle,
            body,
        }, dryRun),
        flatMap((created): Result<AppError, number> => {
            const flagNumber = created.number;
            const flagNodeId = created.nodeId;
            const actualTitle = generateFlagTitle(featureNumber, flagNumber, context);

            return pipe(
                github.setIssueType(repoInfo.owner, repoInfo.repo, flagNumber, flagType, dryRun),
                flatMap(() => github.updateIssueTitle(flagNumber, actualTitle, dryRun)),
                flatMap(() => github.linkSubIssue(repoInfo.owner, repoInfo.repo, featureNumber, flagNodeId, dryRun)),
                flatMap(() => github.setIssueFieldValue(repoInfo.owner, repoInfo.repo, flagNumber, "Flag Stage", "backlog ✳️", dryRun)),
                map(() => flagNumber)
            ) as Result<AppError, number>;
        })
    );
};

const linkToParentEpic = (
    repoInfo: RepoInfo,
    parentEpicName: string,
    featureId: string,
    epicResults: readonly DocProcessResult[],
    epicPaths: readonly string[],
    dryRun: boolean
): Result<AppError, void> => {
    const parentEpic = epicResults.find((res, idx) => {
        const path = epicPaths[idx];
        const fileName = basename(path).replace(".md", "");
        return path.includes(parentEpicName) || fileName.includes(parentEpicName) || fileName.includes(parentEpicName.toLowerCase().replace(/ /g, "-"));
    });

    if (parentEpic && parentEpic.number) {
        // Check if already linked to avoid duplicate sub-issue error
        const isLinkedRes = github.isSubIssueLinked(repoInfo.owner, repoInfo.repo, parentEpic.number, featureId);

        if (isSuccess(isLinkedRes) && isLinkedRes.value) {
            // Already linked, skip
            return success(undefined);
        }

        log.info(`Linking feature to epic #${parentEpic.number}...`);
        return github.linkSubIssue(repoInfo.owner, repoInfo.repo, parentEpic.number, featureId, dryRun) as Result<AppError, void>;
    }

    return success(undefined);
};

const processFeature = (
    filePath: string,
    repoInfo: RepoInfo,
    featureType: string | null,
    flagType: string | null,
    epicResults: readonly DocProcessResult[],
    epicPaths: readonly string[],
    dryRun: boolean
): Result<AppError, DocProcessResult> => {
    const fileName = basename(filePath);
    const domain = extractDomainFromPath(filePath);

    return pipe(
        readFile(filePath),
        flatMap((content: string): Result<AppError, DocProcessResult> => {
            const fm = parseFeatureFrontmatter(content);
            let updatedContent = content;
            let issueUrl = fm.issue_url ?? null;
            let issueNumber = fm.issue_number ?? null;
            let issueId = (fm as any).issue_id ?? null;
            let flagIssueNumber = fm.flag_issue_number ?? null;

            if (!issueUrl) {
                log.info(`Creating Feature issue for ${fileName}...`);
                const title = fm.feature_name || getDocumentTitle(content, fileName.replace(".md", ""));
                const body = getDocumentBody(content);

                const createdRes = github.createIssue({ owner: repoInfo.owner, repo: repoInfo.repo, title, body }, dryRun);
                if (isFailure(createdRes)) return createdRes as Result<AppError, DocProcessResult>;

                issueUrl = createdRes.value.url;
                issueNumber = createdRes.value.number;
                issueId = createdRes.value.nodeId;

                if (featureType) {
                    github.setIssueType(repoInfo.owner, repoInfo.repo, issueNumber, featureType, dryRun);
                }

                // Add domain label for domain-specific features
                if (domain && issueNumber !== null) {
                    log.info(`Adding domain label '${domain}' to feature #${issueNumber}...`);
                    github.addLabels(repoInfo.owner, repoInfo.repo, issueNumber, [domain], dryRun);
                }

                const flagBlock = parseFlagBlock(updatedContent);
                const flagIssueMap: Record<string, number> = {};

                if (flagBlock && flagType && issueNumber !== null && issueId !== null) {
                    for (const flag of flagBlock.flags) {
                        let currentFlagNum: number | null = null;
                        if (flag.key && isValidFlagKey(flag.key)) {
                            const parsed = parseFlagKey(flag.key);
                            if (parsed) currentFlagNum = parsed.flagNumber;
                        }

                        if (!currentFlagNum) {
                            const createFlagRes = createFlagForFeature(repoInfo, issueNumber, issueId, flag.context, flagType, dryRun);
                            if (isSuccess(createFlagRes)) currentFlagNum = createFlagRes.value;
                        }

                        if (currentFlagNum) {
                            flagIssueMap[flag.context] = currentFlagNum;
                            if (!flagIssueNumber) flagIssueNumber = currentFlagNum;
                        }
                    }
                }

                if (fm.parent_epic && issueId) {
                    const linkRes = linkToParentEpic(repoInfo, fm.parent_epic, issueId, epicResults, epicPaths, dryRun);
                    if (isFailure(linkRes)) return linkRes as Result<AppError, DocProcessResult>;
                }

                updatedContent = updateFeatureWithIssue(updatedContent, issueUrl, issueNumber, issueId, flagIssueNumber ?? undefined);
                if (issueNumber !== null && Object.keys(flagIssueMap).length > 0) {
                    updatedContent = anchorFlagKeysInContent(updatedContent, issueNumber, flagIssueMap);
                }

                const writeRes = writeFile(filePath, updatedContent);
                if (isFailure(writeRes)) return writeRes as Result<AppError, DocProcessResult>;
            } else {
                log.info(`Updating body for issue #${issueNumber}...`);
                const body = getDocumentBody(updatedContent);
                github.updateIssueBody(issueNumber!, body, dryRun);

                const flagBlock = parseFlagBlock(updatedContent);
                const flagIssueMap: Record<string, number> = {};

                if (flagBlock && flagType && issueNumber !== null && issueId !== null) {
                    for (const flag of flagBlock.flags) {
                        let currentFlagNum: number | null = null;
                        if (flag.key && isValidFlagKey(flag.key)) {
                            const parsed = parseFlagKey(flag.key);
                            if (parsed) currentFlagNum = parsed.flagNumber;
                        }

                        if (!currentFlagNum) {
                            const createFlagRes = createFlagForFeature(repoInfo, issueNumber, issueId, flag.context, flagType, dryRun);
                            if (isSuccess(createFlagRes)) currentFlagNum = createFlagRes.value;
                        }

                        if (currentFlagNum) {
                            flagIssueMap[flag.context] = currentFlagNum;
                            if (!flagIssueNumber) flagIssueNumber = currentFlagNum;
                        }
                    }
                }

                if (flagIssueNumber && flagIssueNumber !== fm.flag_issue_number) {
                    updatedContent = updateWithFlagIssue(updatedContent, flagIssueNumber);
                }

                if (issueNumber !== null && Object.keys(flagIssueMap).length > 0) {
                    updatedContent = anchorFlagKeysInContent(updatedContent, issueNumber, flagIssueMap);
                }

                if (updatedContent !== content) {
                    const writeRes = writeFile(filePath, updatedContent);
                    if (isFailure(writeRes)) return writeRes as Result<AppError, DocProcessResult>;
                }

                if (fm.parent_epic && issueId) {
                    const linkRes = linkToParentEpic(repoInfo, fm.parent_epic, issueId, epicResults, epicPaths, dryRun);
                    if (isFailure(linkRes)) return linkRes as Result<AppError, DocProcessResult>;
                }
            }

            const renamed = issueNumber !== null ? calculateFeatureRename(filePath, issueNumber) : null;

            return success({
                type: "Feature",
                id: issueId,
                number: issueNumber,
                url: issueUrl,
                renamed,
                flagIssueNumber,
            });
        })
    );
};

// ============================================================================
// Rename Execution
// ============================================================================

const executeRenames = (
    renames: readonly RenameOperation[],
    docsRoot: string
): Result<AppError, void> => {
    if (renames.length === 0) return success(undefined);

    log.info(`🔄 Performing ${renames.length} renames and link updates...`);

    for (const r of renames) {
        const res = renameFile(r.oldPath, r.newPath);
        if (isFailure(res)) return res as Result<AppError, void>;
    }

    return pipe(
        listMarkdownFiles(docsRoot),
        flatMap(files => {
            for (const docPath of files) {
                const contentRes = readFile(docPath);
                if (isSuccess(contentRes)) {
                    const updated = updateLinksInContent(contentRes.value, renames as RenameOperation[]);
                    if (updated !== contentRes.value) {
                        writeFile(docPath, updated);
                    }
                }
            }
            return success(undefined);
        })
    );
};

const createCleanupPR = (dryRun: boolean): void => {
    if (!process.env.GITHUB_ACTIONS) return;
    log.info("Preparing cleanup PR...");
    const branchName = `docs/sync-cleanup-${Date.now()}`;
    git.configureActionsUser(dryRun);
    if (git.createAndPushBranch(branchName, "docs: sync issue identities and rename files", dryRun)) {
        github.createPullRequest(
            "docs: sync issue identities and rename files",
            "This PR was automatically created to sync identities.",
            "main",
            branchName,
            dryRun
        );
    }
};

// ============================================================================
// Main Application
// ============================================================================

const main = async (): Promise<Result<AppError, void>> => {
    const options = parseArgs(process.argv.slice(2));

    log.info("🔄 Planning Lifecycle Sync");
    log.info(`Mode: ${options.dryRun ? "DRY RUN" : "LIVE"}`);

    const repoInfoRes = github.getRepoInfo(options.repo);
    if (isFailure(repoInfoRes)) return repoInfoRes as Result<AppError, void>;
    const repoInfo = repoInfoRes.value;

    const issueTypesRes = github.getIssueTypes(repoInfo.owner);
    const issueTypes = isSuccess(issueTypesRes) ? issueTypesRes.value : [];

    const epicType = findBestIssueType(issueTypes as string[], "Epic");
    const featureType = findBestIssueType(issueTypes as string[], "Feature");
    const flagType = findBestIssueType(issueTypes as string[], "Flag");

    // Collect all epic files from domain-specific requirement directories
    const domainDirs = getDomainRequirementDirs();
    let allEpicFiles: string[] = [];
    let allFeatureFiles: string[] = [];

    for (const domainDir of domainDirs) {
        const epicsDir = join(domainDir, "epics");
        const featuresDir = join(domainDir, "features");

        const epicFilesRes = listMarkdownFiles(epicsDir);
        if (isSuccess(epicFilesRes)) {
            allEpicFiles = allEpicFiles.concat(epicFilesRes.value);
        }

        const featureFilesRes = listMarkdownFiles(featuresDir);
        if (isSuccess(featureFilesRes)) {
            allFeatureFiles = allFeatureFiles.concat(featureFilesRes.value);
        }
    }

    // Also process global requirement files (non-epic/feature documents like vision, roadmap, strategy)
    const globalFilesRes = listMarkdownFiles(GLOBAL_REQUIREMENT_DIR);
    if (isSuccess(globalFilesRes)) {
        // Global requirements are processed as documents without type-specific handling
        log.info(`\n📋 Found ${globalFilesRes.value.length} global requirement documents`);
    }

    log.info(`\n📚 Processing ${allEpicFiles.length} epics from ${domainDirs.length} domains...`);

    const epicResults = allEpicFiles.map(path => processEpic(path, repoInfo, epicType, options.dryRun));
    const epicFailures = epicResults.filter(isFailure);
    if (epicFailures.length > 0) return epicFailures[0] as Result<AppError, void>;
    const successfulEpics = epicResults.filter(isSuccess).map(r => r.value);

    log.info(`\n📦 Processing ${allFeatureFiles.length} features...`);

    const featureResults = allFeatureFiles.map(path => processFeature(path, repoInfo, featureType, flagType, successfulEpics, allEpicFiles, options.dryRun));
    const featureFailures = featureResults.filter(isFailure);
    if (featureFailures.length > 0) return featureFailures[0] as Result<AppError, void>;
    const successfulFeatures = featureResults.filter(isSuccess).map(r => r.value);

    const allResults = [...successfulEpics, ...successfulFeatures];
    const pendingRenames = filterPendingRenames(allResults.map(r => r.renamed));

    if (pendingRenames.length > 0) {
        if (!options.dryRun) {
            const renameRes = executeRenames(pendingRenames, SRC_ROOT);
            if (isFailure(renameRes)) return renameRes;
            createCleanupPR(options.dryRun);
        } else {
            log.info(`\n[DRY RUN] Would rename ${pendingRenames.length} files`);
            pendingRenames.forEach(r => log.info(`  ${r.oldName} -> ${r.newName}`));
        }
    }

    log.info("\n✅ Sync complete!");
    return success(undefined);
};

main().then(res => {
    if (isFailure(res)) {
        log.error(`Fatal error: ${res.error.message}`);
        process.exit(1);
    }
}).catch(err => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
