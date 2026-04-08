/**
 * github.ts
 *
 * Functional shell wrappers for GitHub CLI operations.
 * All functions return Result types and avoid throwing exceptions.
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { type Result, success, failure, pipe, map, flatMap } from "./fp.js";
import type { RepoInfo, IssueData, CreateIssueRequest } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export type GhError =
    | { readonly _tag: "GhCliError"; readonly message: string; readonly stdout?: string; readonly stderr?: string }
    | { readonly _tag: "ParseError"; readonly message: string; readonly raw: string }
    | { readonly _tag: "NotFoundError"; readonly message: string };

// ============================================================================
// Shell Wrapper
// ============================================================================

/**
 * Execute a GitHub CLI command and return stdout as a Result
 */
export const execGh = (args: string, dryRun: boolean = false): Result<GhError, string> => {
    // Read operations should always execute even in dry run
    const isRead =
        args.includes("repo view") ||
        args.includes("issue view") ||
        args.includes('api "/repos') ||
        args.includes("api /repos") ||
        args.includes("api orgs/") ||
        args.includes("-X GET") ||
        args.includes("api graphql");

    if (dryRun && !isRead) {
        console.log(`[DRY RUN] gh ${args}`);
        return success("");
    }

    try {
        const stdout = execSync(`gh ${args}`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return success(stdout);
    } catch (e) {
        const error = e as Error & { stdout?: string; stderr?: string };
        return failure({
            _tag: "GhCliError",
            message: error.message,
            stdout: error.stdout,
            stderr: error.stderr,
        } as GhError);
    }
};

// ============================================================================
// Repository Information
// ============================================================================

/**
 * Get current repository owner and name
 */
export const getRepoInfo = (repoArg?: string): Result<GhError, RepoInfo> => {
    if (repoArg) {
        const parts = repoArg.split("/");
        if (parts.length === 2 && parts[0] && parts[1]) {
            return success({ owner: parts[0], repo: parts[1] });
        }
        return failure({ _tag: "ParseError", message: "Invalid repo format", raw: repoArg } as GhError);
    }

    return pipe(
        execGh("repo view --json name,owner", false),
        flatMap(json => {
            try {
                const parsed = JSON.parse(json) as { owner: { login: string }; name: string };
                return success({ owner: parsed.owner.login, repo: parsed.name });
            } catch {
                return failure({ _tag: "ParseError", message: "Failed to parse repo info", raw: json } as GhError);
            }
        })
    );
};

// ============================================================================
// Issue Types
// ============================================================================

/**
 * Get available issue types for an organization
 */
export const getIssueTypes = (owner: string): Result<GhError, readonly string[]> =>
    pipe(
        execGh(`api orgs/${owner}/issue-types --jq ".[] | {name}"`, false),
        map(result =>
            result
                .split("\n")
                .filter(Boolean)
                .map(line => {
                    try {
                        return (JSON.parse(line) as { name: string }).name;
                    } catch {
                        return null;
                    }
                })
                .filter((n): n is string => n !== null)
        )
    );

/**
 * Set issue type via REST API
 */
export const setIssueType = (
    owner: string,
    repo: string,
    number: number,
    typeName: string,
    dryRun: boolean = false
): Result<GhError, void> =>
    !typeName
        ? failure({ _tag: "ParseError", message: "Type name is required", raw: "" } as GhError)
        : pipe(
            execGh(`api -X PATCH /repos/${owner}/${repo}/issues/${number} -f type="${typeName}"`, dryRun),
            map(() => undefined)
        );

// ============================================================================
// Issue CRUD Operations
// ============================================================================

/**
 * Create a new GitHub issue
 */
export const createIssue = (
    request: CreateIssueRequest,
    dryRun: boolean = false
): Result<GhError, IssueData> => {
    const { owner, repo, title, body } = request;
    const tempFile = join(tmpdir(), `issue_body_${Date.now()}.md`);
    writeFileSync(tempFile, body);

    try {
        const ghRes = execGh(
            `api -X POST /repos/${owner}/${repo}/issues -f title="${title}" --field body=@${tempFile}`,
            dryRun
        );

        if (dryRun) {
            return success({
                number: 0,
                id: "dry-run",
                nodeId: "dry-run",
                url: `https://github.com/${owner}/${repo}/issues/0`,
                title,
            });
        }

        return pipe(
            ghRes,
            flatMap(result => {
                try {
                    const parsed = JSON.parse(result) as {
                        number: number;
                        id: number;
                        node_id: string;
                        html_url: string;
                        title: string;
                    };

                    return success({
                        number: parsed.number,
                        id: String(parsed.id),
                        nodeId: parsed.node_id,
                        url: parsed.html_url,
                        title: parsed.title,
                    });
                } catch {
                    return failure({ _tag: "ParseError", message: "Failed to parse created issue", raw: result } as GhError);
                }
            })
        );
    } finally {
        try { unlinkSync(tempFile); } catch { }
    }
};

/**
 * Update issue body
 */
export const updateIssueBody = (
    number: number,
    body: string,
    dryRun: boolean = false
): Result<GhError, void> => {
    const tempFile = join(tmpdir(), `issue_body_update_${Date.now()}.md`);
    writeFileSync(tempFile, body);
    try {
        return pipe(
            execGh(`issue edit ${number} --body-file "${tempFile}"`, dryRun),
            map(() => undefined)
        );
    } finally {
        try { unlinkSync(tempFile); } catch { }
    }
};

/**
 * Update issue title
 */
export const updateIssueTitle = (
    number: number,
    title: string,
    dryRun: boolean = false
): Result<GhError, void> =>
    pipe(
        execGh(`issue edit ${number} --title "${title}"`, dryRun),
        map(() => undefined)
    );

/**
 * Get issue details by number
 */
export const getIssue = (number: number): Result<GhError, { id: string; nodeId: string }> =>
    pipe(
        execGh(`issue view ${number} --json id`, false),
        flatMap(json => {
            try {
                const parsed = JSON.parse(json) as { id: string };
                return success({ id: parsed.id, nodeId: parsed.id });
            } catch {
                return failure({ _tag: "ParseError", message: "Failed to parse issue details", raw: json } as GhError);
            }
        })
    );

// ============================================================================
// Sub-Issue Linking
// ============================================================================

/**
 * Get database ID from node ID
 */
export const getDatabaseId = (nodeId: string): Result<GhError, string> => {
    if (/^\d+$/.test(String(nodeId))) {
        return success(String(nodeId));
    }

    return pipe(
        execGh(
            `api graphql -f query='query { node(id: "${nodeId}") { ... on Issue { databaseId } } }'`,
            false
        ),
        flatMap(result => {
            try {
                const parsed = JSON.parse(result) as { data: { node: { databaseId: number } } };
                return success(String(parsed.data.node.databaseId));
            } catch {
                return failure({ _tag: "ParseError", message: "Failed to parse database ID", raw: result } as GhError);
            }
        })
    );
};

/**
 * Get sub-issues of a parent issue
 */
export const getSubIssues = (
    owner: string,
    repo: string,
    parentNumber: number
): Result<GhError, readonly string[]> =>
    pipe(
        execGh(`api repos/${owner}/${repo}/issues/${parentNumber}/sub_issues --jq '.[].node_id'`, false),
        map(result =>
            result
                .split("\n")
                .filter(Boolean)
        )
    );

/**
 * Check if a sub-issue is already linked to a parent
 */
export const isSubIssueLinked = (
    owner: string,
    repo: string,
    parentNumber: number,
    childNodeId: string
): Result<GhError, boolean> =>
    pipe(
        getSubIssues(owner, repo, parentNumber),
        map(subIssues => subIssues.includes(childNodeId))
    );

/**
 * Link a child issue as a sub-issue to a parent
 */
export const linkSubIssue = (
    owner: string,
    repo: string,
    parentNumber: number,
    childNodeId: string,
    dryRun: boolean = false
): Result<GhError, void> =>
    pipe(
        getDatabaseId(childNodeId),
        flatMap(dbId =>
            pipe(
                execGh(
                    `api repos/${owner}/${repo}/issues/${parentNumber}/sub_issues -X POST -F sub_issue_id=${dbId}`,
                    dryRun
                ),
                map(() => undefined)
            )
        )
    );

/**
 * Set a custom issue field value
 */
export const setIssueFieldValue = (
    owner: string,
    repo: string,
    issueNumber: number,
    fieldName: string,
    value: string,
    dryRun: boolean = false
): Result<GhError, void> =>
    pipe(
        execGh(`api /orgs/${owner}/issue-fields`, false),
        flatMap(fieldsJson => {
            try {
                const fields = JSON.parse(fieldsJson) as Array<{ id: number; name: string }>;
                const field = fields.find(f => f.name === fieldName);

                if (!field) {
                    return failure({ _tag: "NotFoundError", message: `Field '${fieldName}' not found` } as GhError);
                }

                return pipe(
                    execGh(`api /repos/${owner}/${repo}/issues/${issueNumber}/issue-field-values`, false),
                    flatMap(existingJson => {
                        let existingValues: Array<{ issue_field_id: number; value: unknown }> = [];
                        try {
                            existingValues = JSON.parse(existingJson) as Array<{ issue_field_id: number; value: unknown }>;
                        } catch { /* ignore */ }

                        const otherFields = existingValues.filter(fv => fv.issue_field_id !== field.id);
                        const allFieldValues = [
                            ...otherFields.map(fv => ({ field_id: fv.issue_field_id, value: fv.value })),
                            { field_id: field.id, value: value }
                        ];

                        const payload = { issue_field_values: allFieldValues };
                        const tempFile = join(tmpdir(), `field_${Date.now()}.json`);
                        try {
                            writeFileSync(tempFile, JSON.stringify(payload));
                            return pipe(
                                execGh(
                                    `api -X PUT /repos/${owner}/${repo}/issues/${issueNumber}/issue-field-values ` +
                                    `-H "Accept: application/vnd.github+json" ` +
                                    `-H "X-GitHub-Api-Version: 2022-11-28" ` +
                                    `--input "${tempFile}"`,
                                    dryRun
                                ),
                                map(() => undefined)
                            );
                        } finally {
                            try { unlinkSync(tempFile); } catch { }
                        }
                    })
                );
            } catch {
                return failure({ _tag: "ParseError", message: "Failed to process issue fields", raw: fieldsJson } as GhError);
            }
        })
    );

// ============================================================================
// Pull Request Operations
// ============================================================================

/**
 * Create a pull request
 */
export const createPullRequest = (
    title: string,
    body: string,
    base: string,
    head: string,
    dryRun: boolean = false
): Result<GhError, void> => {
    const tempFile = join(tmpdir(), `pr_body_${Date.now()}.md`);
    writeFileSync(tempFile, body);
    try {
        return pipe(
            execGh(
                `pr create --title "${title}" --body-file "${tempFile}" --base ${base} --head ${head}`,
                dryRun
            ),
            map(() => undefined)
        );
    } finally {
        try { unlinkSync(tempFile); } catch { }
    }
};

// ============================================================================
// Issue Labels
// ============================================================================

/**
 * Add labels to an issue
 */
export const addLabels = (
    owner: string,
    repo: string,
    issueNumber: number,
    labels: readonly string[],
    dryRun: boolean = false
): Result<GhError, void> => {
    if (labels.length === 0) {
        return success(undefined);
    }
    
    const payload = { labels: [...labels] };
    const tempFile = join(tmpdir(), `labels_${Date.now()}.json`);
    
    try {
        writeFileSync(tempFile, JSON.stringify(payload));
        return pipe(
            execGh(
                `api -X POST /repos/${owner}/${repo}/issues/${issueNumber}/labels --input "${tempFile}"`,
                dryRun
            ),
            map(() => undefined)
        );
    } finally {
        try { unlinkSync(tempFile); } catch { }
    }
};
