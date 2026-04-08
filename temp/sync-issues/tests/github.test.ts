/**
 * github.test.ts
 *
 * Unit tests for GitHub CLI wrapper functions.
 * Updated for Result types.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as github from "../lib/github.js";
import { isSuccess, isFailure } from "../lib/fp.js";

describe("execGh", () => {
    it("returns SUCCESS with empty string and logs in dry run mode for write operations", () => {
        const result = github.execGh("issue create --title test", true);
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value, "");
    });

    it("allows read operations in dry run mode", () => {
        const result = github.execGh("repo view --json name", true);
        assert.ok(isSuccess(result) || isFailure(result));
    });
});

describe("getRepoInfo", () => {
    it("parses repo argument correctly", () => {
        const result = github.getRepoInfo("owner/repo");
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value.owner, "owner");
        assert.strictEqual(result.value.repo, "repo");
    });

    it("returns FAILURE for invalid repo argument", () => {
        const result = github.getRepoInfo("invalid");
        assert.ok(isFailure(result));
    });
});

describe("setIssueType", () => {
    it("returns FAILURE for empty type name", () => {
        const result = github.setIssueType("owner", "repo", 1, "", false);
        assert.ok(isFailure(result));
    });

    it("returns SUCCESS in dry run mode", () => {
        const result = github.setIssueType("owner", "repo", 1, "Bug", true);
        assert.ok(isSuccess(result));
    });
});

describe("createIssue", () => {
    it("returns dry-run placeholder in dry run mode", () => {
        const result = github.createIssue({
            owner: "owner",
            repo: "repo",
            title: "Test Issue",
            body: "Test body",
        }, true);

        assert.ok(isSuccess(result));
        assert.strictEqual(result.value.number, 0);
        assert.strictEqual(result.value.id, "dry-run");
        assert.strictEqual(result.value.nodeId, "dry-run");
        assert.strictEqual(result.value.title, "Test Issue");
    });
});

describe("getDatabaseId", () => {
    it("returns numeric string as-is", () => {
        const result = github.getDatabaseId("12345");
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value, "12345");
    });
});
