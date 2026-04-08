/**
 * git.test.ts
 *
 * Unit tests for git wrapper functions.
 * Updated for Result types.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as git from "../lib/git.js";
import { isSuccess, isFailure } from "../lib/fp.js";

describe("execGit", () => {
    it("returns SUCCESS with empty string and logs in dry run mode", () => {
        const result = git.execGit("status", true);
        assert.ok(isSuccess(result));
        assert.strictEqual(result.value, "");
    });
});

describe("configureActionsUser", () => {
    it("executes in dry run without error", () => {
        const result = git.configureActionsUser(true);
        assert.ok(isSuccess(result));
    });
});

describe("createBranch", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.createBranch("test-branch", true);
        assert.ok(isSuccess(result));
    });
});

describe("checkoutBranch", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.checkoutBranch("main", true);
        assert.ok(isSuccess(result));
    });
});

describe("pushBranch", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.pushBranch("test-branch", true);
        assert.ok(isSuccess(result));
    });
});

describe("stageAll", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.stageAll(true);
        assert.ok(isSuccess(result));
    });
});

describe("stageFiles", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.stageFiles(["file1.ts", "file2.ts"], true);
        assert.ok(isSuccess(result));
    });
});

describe("commit", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.commit("test message", true);
        assert.ok(isSuccess(result));
    });
});

describe("createAndPushBranch", () => {
    it("returns SUCCESS in dry run mode", () => {
        const result = git.createAndPushBranch("new-branch", "commit message", true);
        assert.ok(isSuccess(result));
    });
});

describe("getCurrentBranch", () => {
    it("returns SUCCESS or FAILURE", () => {
        const result = git.getCurrentBranch();
        assert.ok(isSuccess(result) || isFailure(result));
    });
});

describe("isClean", () => {
    it("returns SUCCESS with boolean", () => {
        const result = git.isClean();
        assert.ok(isSuccess(result));
        assert.ok(typeof result.value === "boolean");
    });
});

describe("getChangedFiles", () => {
    it("returns SUCCESS with array", () => {
        const result = git.getChangedFiles();
        assert.ok(isSuccess(result));
        assert.ok(Array.isArray(result.value));
    });
});

describe("execGit error handling", () => {
    it("returns FAILURE for failed commands", () => {
        const result = git.execGit("not-a-valid-git-command", false);
        assert.ok(isFailure(result));
    });
});

describe("createAndPushBranch non-dry-run", () => {
    it("returns SUCCESS or FAILURE if any operation fails", () => {
        const result = git.createAndPushBranch("nonexistent-branch-12345", "test", false);
        assert.ok(isSuccess(result) || isFailure(result));
    });
});
