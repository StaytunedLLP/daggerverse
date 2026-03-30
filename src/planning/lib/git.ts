/**
 * git.ts
 *
 * Functional shell wrappers for Git operations.
 * All functions return Result types.
 */

import { execSync } from "node:child_process";
import { type Result, success, failure, pipe, map, flatMap } from "./fp.js";

// ============================================================================
// Types
// ============================================================================

export type GitError = { readonly _tag: "GitError"; readonly message: string; readonly command: string };

// ============================================================================
// Shell Wrapper
// ============================================================================

/**
 * Execute a git command and return stdout
 */
export const execGit = (args: string, dryRun: boolean = false): Result<GitError, string> => {
    if (dryRun) {
        console.log(`[DRY RUN] git ${args}`);
        return success("");
    }

    try {
        const stdout = execSync(`git ${args}`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return success(stdout);
    } catch (e) {
        return failure({ _tag: "GitError", message: (e as Error).message, command: args } as GitError);
    }
};

// ============================================================================
// Git Configuration
// ============================================================================

/**
 * Configure git user for GitHub Actions bot
 */
export const configureActionsUser = (dryRun: boolean = false): Result<GitError, void> => {
    return pipe(
        execGit('config user.name "github-actions[bot]"', dryRun),
        flatMap(() => execGit('config user.email "github-actions[bot]@users.noreply.github.com"', dryRun)),
        map(() => undefined)
    );
};

// ============================================================================
// Branch Operations
// ============================================================================

/**
 * Create a new branch from current HEAD
 */
export const createBranch = (branchName: string, dryRun: boolean = false): Result<GitError, string> =>
    execGit(`checkout -b ${branchName}`, dryRun);

/**
 * Checkout an existing branch
 */
export const checkoutBranch = (branchName: string, dryRun: boolean = false): Result<GitError, string> =>
    execGit(`checkout ${branchName}`, dryRun);

/**
 * Push branch to remote
 */
export const pushBranch = (branchName: string, dryRun: boolean = false): Result<GitError, string> =>
    execGit(`push origin ${branchName}`, dryRun);

// ============================================================================
// Staging and Commits
// ============================================================================

/**
 * Stage all changes
 */
export const stageAll = (dryRun: boolean = false): Result<GitError, string> =>
    execGit("add .", dryRun);

/**
 * Stage specific files
 */
export const stageFiles = (files: readonly string[], dryRun: boolean = false): Result<GitError, string> => {
    const escaped = files.map(f => `"${f}"`).join(" ");
    return execGit(`add ${escaped}`, dryRun);
};

/**
 * Commit staged changes
 */
export const commit = (message: string, dryRun: boolean = false): Result<GitError, string> =>
    execGit(`commit -m "${message}"`, dryRun);

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get current branch name
 */
export const getCurrentBranch = (): Result<GitError, string> =>
    execGit("rev-parse --abbrev-ref HEAD", false);

/**
 * Check if working tree is clean
 */
export const isClean = (): Result<GitError, boolean> =>
    pipe(
        execGit("status --porcelain", false),
        map(status => status === "")
    );

/**
 * Get list of changed files
 */
export const getChangedFiles = (): Result<GitError, readonly string[]> =>
    pipe(
        execGit("status --porcelain", false),
        map(status => status ? status.split("\n").filter(Boolean).map(line => line.slice(3)) : [])
    );

// ============================================================================
// Composite Operations
// ============================================================================

/**
 * Create branch, stage all, commit, and push
 */
export const createAndPushBranch = (
    branchName: string,
    commitMessage: string,
    dryRun: boolean = false
): Result<GitError, void> =>
    pipe(
        createBranch(branchName, dryRun),
        flatMap(() => stageAll(dryRun)),
        flatMap(() => commit(commitMessage, dryRun)),
        flatMap(() => pushBranch(branchName, dryRun)),
        map(() => undefined)
    );
