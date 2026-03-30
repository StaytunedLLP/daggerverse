/**
 * github_improved.test.ts
 * 
 * Tests for github.ts that rely on a mocked gh CLI in the PATH.
 * Updated for Result types.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as github from "../lib/github.js";
import { setupMockEnv } from "./mock-setup.js";
import { isSuccess, isFailure } from "../lib/fp.js";

describe("GitHub Library Coverage Improvement", () => {
    setupMockEnv();


    it("getRepoInfo: handles successful mock response", () => {
        const result = github.getRepoInfo();
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value.owner, "mock-owner");
            assert.strictEqual(result.value.repo, "mock-repo");
        }
    });

    it("getIssueTypes: handles mixed valid and invalid JSON lines", () => {
        const result = github.getIssueTypes("mock-org");
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value.length, 1);
            assert.strictEqual(result.value[0], "Valid");
        }
    });

    it("getIssue: handles valid response", () => {
        const result = github.getIssue(123);
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value.id, "123");
        }
    });

    it("getIssue: handles invalid JSON path (catch block)", () => {
        const result = github.getIssue(888);
        assert.ok(isFailure(result));
    });

    it("createIssue: handles success path", () => {
        const result = github.createIssue({
            owner: "o",
            repo: "r",
            title: "t",
            body: "b"
        }, false);
        assert.ok(isSuccess(result));
        if (isSuccess(result)) {
            assert.strictEqual(result.value.number, 1);
        }
    });

    it("setIssueType: handles failure path", () => {
        const result = github.setIssueType("o", "r", 1, "fail-type", false);
        assert.ok(isFailure(result));
    });

    it("linkSubIssue: handles failure case", () => {
        const result = github.linkSubIssue("o", "r", 1, "nonexistent", false);
        assert.ok(isFailure(result));
    });
});
